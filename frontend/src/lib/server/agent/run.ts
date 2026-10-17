import { CRUSOE_AGENT_MODEL } from '$app/env/private';
import { chat, hasApiKey, type ChatMessage, type Usage } from '../crusoe';
import * as store from '../store';
import type { MessageMeta, RunEvent } from '#lib/types.ts';
import { mockChat } from './mock';
import { SYSTEM_PROMPT } from './prompt';
import { TOOL_SCHEMAS, runTool } from './tools';

const MAX_TURNS = 12;
const running = new Map<string, AbortController>();

export const isRunning = (conversationId: string) => running.has(conversationId);

export function cancelRun(conversationId: string) {
	running.get(conversationId)?.abort(new Error('Cancelled'));
}

/**
 * Append the user's input and run the agent loop until it answers without tool calls.
 * One run per conversation at a time.
 */
export async function runAgent(
	conversationId: string,
	input: { content: string; meta?: MessageMeta },
	emit: (e: RunEvent) => void
) {
	if (running.has(conversationId)) throw new Error('The agent is already working in this conversation');
	const controller = new AbortController();
	running.set(conversationId, controller);
	const { signal } = controller;
	const model = CRUSOE_AGENT_MODEL;
	const llm = hasApiKey() ? chat : mockChat;
	let pendingCalls: string[] = [];

	try {
		const conversation = await store.getConversation(conversationId);
		await store.appendMessage(conversationId, { role: 'user', content: input.content }, input.meta);
		if (!input.meta && conversation?.title === 'New conversation') {
			await store.touchConversation(conversationId, input.content.replace(/\s+/g, ' ').slice(0, 60));
		} else {
			await store.touchConversation(conversationId);
		}
		emit({ type: 'changed' });

		for (let turn = 0; turn < MAX_TURNS; turn++) {
			emit({ type: 'status', text: turn === 0 ? 'Thinking' : 'Continuing' });
			const history = await store.loadHistory(conversationId);
			const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
			const result = await llm({
				model,
				messages,
				tools: TOOL_SCHEMAS,
				maxTokens: 8192,
				signal,
				onDelta: (text) => emit({ type: 'delta', text }),
				onReasoning: (text) => emit({ type: 'reasoning', text }),
				onRetry: (attempt, waitMs, status) =>
					emit({ type: 'status', text: `Crusoe returned ${status}; retry ${attempt} in ${Math.round(waitMs / 1000)}s` })
			});
			await store.recordUsage(conversationId, model, 'agent', result.usage);
			await store.appendMessage(conversationId, {
				role: 'assistant',
				content: result.content || null,
				toolCalls: result.toolCalls
			});
			emit({ type: 'changed' });

			if (!result.toolCalls.length) {
				if (!result.content && result.finishReason === 'length') {
					throw new Error('The model ran out of tokens while reasoning (finish_reason=length).');
				}
				break;
			}

			pendingCalls = result.toolCalls.map((c) => c.id);
			const share: Usage = {
				...result.usage,
				costUsd: result.usage.costUsd / result.toolCalls.length,
				durationMs: Math.round(result.usage.durationMs / result.toolCalls.length)
			};
			// Tool calls from one turn run concurrently (e.g. parallel quick_edit sub-agents);
			// results are appended in call order, right after the assistant message (skill §7.3).
			const outputs = await Promise.all(
				result.toolCalls.map((c) =>
					runTool(c.function.name, c.function.arguments, { conversationId, model, usage: share, signal, emit })
				)
			);
			for (const [i, c] of result.toolCalls.entries()) {
				await store.appendMessage(
					conversationId,
					{ role: 'tool', content: outputs[i].content, toolCallId: c.id },
					outputs[i].meta
				);
			}
			pendingCalls = [];
			emit({ type: 'changed' });
		}
	} catch (err) {
		// Keep history valid: every tool call needs a result before the next request.
		for (const id of pendingCalls) {
			await store.appendMessage(conversationId, {
				role: 'tool',
				content: JSON.stringify({ ok: false, error: 'Interrupted' }),
				toolCallId: id
			});
		}
		const message = (err as Error).message;
		await store.appendMessage(conversationId, { role: 'assistant', content: message }, { kind: 'error' });
		emit({ type: 'error', message });
	} finally {
		running.delete(conversationId);
		await store.touchConversation(conversationId);
		emit({ type: 'done' });
	}
}
