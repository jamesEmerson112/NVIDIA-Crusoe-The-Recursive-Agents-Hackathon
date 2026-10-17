import { CRUSOE_AGENT_MODEL } from '$app/env/private';
import { chat, hasApiKey, type ChatMessage, type Usage } from '../crusoe';
import * as store from '../store';
import type { MessageMeta, RunEvent } from '#lib/types.ts';
import { mockChat } from './mock';
import { SYSTEM_PROMPT } from './prompt';
import { TOOL_SCHEMAS, runTool, type ToolOutput } from './tools';

const MAX_TURNS = 12;
/** How many times one run may send the agent back to fix its own final answer. */
const MAX_CHECKS = 2;
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
	if (running.has(conversationId))
		throw new Error('The agent is already working in this conversation');
	const controller = new AbortController();
	running.set(conversationId, controller);
	const { signal } = controller;
	const model = CRUSOE_AGENT_MODEL;
	const llm = hasApiKey() ? chat : mockChat;
	let pendingCalls: string[] = [];
	let checks = 0;
	const sources = new Set<string>(
		input.meta?.kind === 'form_submit' || input.meta?.kind === 'artifact_edit'
			? [input.meta.artifactId]
			: []
	);

	try {
		const conversation = await store.getConversation(conversationId);
		await store.appendMessage(conversationId, { role: 'user', content: input.content }, input.meta);
		if (!input.meta && conversation?.title === 'New conversation') {
			await store.touchConversation(
				conversationId,
				input.content.replace(/\s+/g, ' ').slice(0, 60)
			);
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
					emit({
						type: 'status',
						text: `Crusoe returned ${status}; retry ${attempt} in ${Math.round(waitMs / 1000)}s`
					})
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
				// Self-check before handing back to the user; a failed check sends the agent back to work.
				const problems =
					checks < MAX_CHECKS ? await checkFinalAnswer(conversationId, result.content) : [];
				if (!problems.length) break;
				checks++;
				emit({
					type: 'tool',
					name: 'self_check',
					summary: `Self-check found ${problems.length} problem(s)`
				});
				await store.appendMessage(
					conversationId,
					{
						role: 'user',
						content: `[Check] Before this goes to the user:\n${problems.map((p) => `- ${p}`).join('\n')}\nFix this now with tool calls, then reply again.`
					},
					{ kind: 'check', problems }
				);
				emit({ type: 'changed' });
				continue;
			}

			pendingCalls = result.toolCalls.map((c) => c.id);
			const share: Usage = {
				...result.usage,
				costUsd: result.usage.costUsd / result.toolCalls.length,
				durationMs: Math.round(result.usage.durationMs / result.toolCalls.length)
			};
			// Tools run in call order (a form may reference a step set_plan just created), except
			// that consecutive quick_edit sub-agents run in parallel. Results are appended in call
			// order, right after the assistant message (skill §7.3).
			const ctx = { conversationId, model, usage: share, signal, emit, sources };
			const outputs: ToolOutput[] = [];
			for (let i = 0; i < result.toolCalls.length;) {
				let j = i + 1;
				if (result.toolCalls[i].function.name === 'quick_edit') {
					while (j < result.toolCalls.length && result.toolCalls[j].function.name === 'quick_edit')
						j++;
				}
				const batch = result.toolCalls.slice(i, j);
				outputs.push(
					...(await Promise.all(
						batch.map((c) =>
							runTool(c.function.name, c.function.arguments, { ...ctx, callId: c.id })
						)
					))
				);
				i = j;
			}
			for (const [i, c] of result.toolCalls.entries()) {
				await store.appendMessage(
					conversationId,
					{ role: 'tool', content: outputs[i].content, toolCallId: c.id },
					outputs[i].meta
				);
			}
			pendingCalls = [];
			emit({ type: 'changed' });
			// A form, widget or redo proposal is now waiting on the user: end the run here.
			// Continuing let the model call create_form again and show the same form twice.
			if (outputs.some((o) => o.awaitUser)) break;
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
		await store.appendMessage(
			conversationId,
			{ role: 'assistant', content: message },
			{ kind: 'error' }
		);
		emit({ type: 'error', message });
	} finally {
		running.delete(conversationId);
		await store.touchConversation(conversationId);
		emit({ type: 'done' });
	}
}

/**
 * Cheap, deterministic checks on the agent's final reply. Models sometimes announce artifacts
 * they never created; every artifact id they mention must exist in this conversation.
 */
async function checkFinalAnswer(conversationId: string, content: string) {
	const problems: string[] = [];
	const mentioned = [...new Set(content.match(/\bart_[0-9a-f]{8}\b/g) ?? [])];
	for (const id of mentioned) {
		if (!(await store.getArtifact(conversationId, id))) {
			problems.push(
				`Your reply mentions ${id}, but no artifact with that id exists: no tool call created it. Create it with create_artifact (ids come only from tool results), or remove the reference.`
			);
		}
	}
	return problems;
}
