import { CRUSOE_API_KEY } from '$app/env/private';
import type { ToolCall } from '#lib/types.ts';

const BASE_URL = 'https://api.inference.crusoecloud.com/v1';

type Price = { input: number; output: number; cached: number };

/**
 * USD per 1M tokens. Replaced at runtime by live prices from GET /v1/models (`refreshPrices`);
 * these are the values that endpoint returned on 2026-10-17, used until the first refresh succeeds.
 * Unknown models cost 0 in estimates.
 */
const prices = new Map<string, Price>(
	Object.entries({
		'openai/gpt-oss-120b': { input: 0.05, output: 0.25, cached: 0.05 },
		'deepseek-ai/Deepseek-V4-Flash': { input: 0.14, output: 0.28, cached: 0.03 },
		'deepseek-ai/DeepSeek-V4.1-Flash': { input: 0.29, output: 1.2, cached: 0.007 },
		'deepseek-ai/DeepSeek-V4-Pro': { input: 1.74, output: 3.48, cached: 0.15 },
		'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B': { input: 0.3, output: 2.4, cached: 0.15 },
		'nvidia/Nemotron-3.5-Lightning-30B-A3B': { input: 0.05, output: 0.2, cached: 0.03 },
		'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B': { input: 0.05, output: 0.2, cached: 0.03 },
		'zai-org/GLM-5.3-Flash': { input: 0.15, output: 0.5, cached: 0.03 }
	})
);

let pricesFetchedAt = 0;
const PRICE_TTL_MS = 60 * 60 * 1000;

/** Pull current prices from /v1/models at most once an hour. Failures keep the last known prices. */
export async function refreshPrices() {
	if (!CRUSOE_API_KEY || Date.now() - pricesFetchedAt < PRICE_TTL_MS) return;
	pricesFetchedAt = Date.now();
	try {
		const res = await fetch(`${BASE_URL}/models`, {
			headers: { Authorization: `Bearer ${CRUSOE_API_KEY}` }
		});
		if (!res.ok) return;
		const { data } = (await res.json()) as {
			data: {
				id: string;
				pricing?: { prompt?: string; completion?: string; input_cache_reads?: string };
			}[];
		};
		for (const m of data) {
			const input = Number(m.pricing?.prompt);
			const output = Number(m.pricing?.completion);
			if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
			const cached = Number(m.pricing?.input_cache_reads);
			prices.set(m.id, { input, output, cached: Number.isFinite(cached) ? cached : input });
		}
	} catch {
		// Offline or transient: keep the fallback table.
	}
}

export type ChatMessage =
	| { role: 'system' | 'user'; content: string }
	| { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
	| { role: 'tool'; content: string; tool_call_id: string };

export interface ToolSchema {
	type: 'function';
	function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Usage {
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number;
	durationMs: number;
}

export interface ChatResult {
	content: string;
	reasoning: string;
	toolCalls: ToolCall[];
	finishReason: string | null;
	usage: Usage;
}

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	tools?: ToolSchema[];
	maxTokens?: number;
	temperature?: number;
	signal?: AbortSignal;
	onDelta?: (text: string) => void;
	onReasoning?: (text: string) => void;
	onRetry?: (attempt: number, waitMs: number, status: number) => void;
}

export const hasApiKey = () => Boolean(CRUSOE_API_KEY);

export function costOf(model: string, prompt: number, completion: number, cached: number) {
	const p = prices.get(model);
	if (!p) return 0;
	return ((prompt - cached) * p.input + cached * p.cached + completion * p.output) / 1e6;
}

// Limits are per model (skill §6), so remaining-request counts are tracked per model.
const rateState = new Map<string, { remaining: number; resetAt: number }>();

async function throttle(model: string, signal?: AbortSignal) {
	const state = rateState.get(model);
	if (!state || state.remaining > 1 || Date.now() > state.resetAt) return;
	await sleep(state.resetAt - Date.now(), signal);
}

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});
}

export class CrusoeError extends Error {
	constructor(
		public status: number,
		body: string
	) {
		super(`Crusoe API ${status}: ${body.slice(0, 500)}`);
	}
}

/**
 * Streaming chat completion with jittered exponential backoff on 429/503 (skill §6).
 * Retries only happen before the first streamed byte, so callbacks never see duplicates.
 */
export async function chat(req: ChatRequest): Promise<ChatResult> {
	if (!CRUSOE_API_KEY) throw new Error('CRUSOE_API_KEY is not set');
	void refreshPrices();
	const body = JSON.stringify({
		model: req.model,
		messages: req.messages,
		...(req.tools?.length ? { tools: req.tools } : {}),
		// Reasoning models spend max_tokens on thinking (skill §7.2).
		max_tokens: req.maxTokens ?? 4096,
		...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
		stream: true,
		stream_options: { include_usage: true }
	});

	const started = Date.now();
	let response: Response | undefined;
	for (let attempt = 0; ; attempt++) {
		await throttle(req.model, req.signal);
		response = await fetch(`${BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${CRUSOE_API_KEY}`, 'Content-Type': 'application/json' },
			body,
			signal: req.signal
		});
		const remaining = Number(response.headers.get('x-ratelimit-remaining-requests'));
		if (!Number.isNaN(remaining) && response.headers.has('x-ratelimit-remaining-requests')) {
			rateState.set(req.model, { remaining, resetAt: Date.now() + 60_000 });
		}
		if (response.ok) break;
		const text = await response.text();
		if ((response.status !== 429 && response.status !== 503) || attempt >= 5) {
			throw new CrusoeError(response.status, text);
		}
		const waitMs = Math.min(60_000, 1000 * 2 ** attempt) + Math.random() * 500;
		req.onRetry?.(attempt + 1, waitMs, response.status);
		await sleep(waitMs, req.signal);
	}

	let content = '';
	let reasoning = '';
	let finishReason: string | null = null;
	const calls: ToolCall[] = [];
	let usage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 };

	const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim();
			if (!data || data === '[DONE]') continue;
			const chunk = JSON.parse(data);
			if (chunk.usage) {
				usage = {
					prompt_tokens: chunk.usage.prompt_tokens ?? 0,
					completion_tokens: chunk.usage.completion_tokens ?? 0,
					cached_tokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
				};
			}
			const choice = chunk.choices?.[0];
			if (!choice) continue;
			if (choice.finish_reason) finishReason = choice.finish_reason;
			const delta = choice.delta ?? {};
			// Models return reasoning under either name (skill §4.6).
			const thought = delta.reasoning_content ?? delta.reasoning;
			if (thought) {
				reasoning += thought;
				req.onReasoning?.(thought);
			}
			if (delta.content) {
				content += delta.content;
				req.onDelta?.(delta.content);
			}
			for (const tc of delta.tool_calls ?? []) {
				const slot = (calls[tc.index ?? 0] ??= {
					id: '',
					type: 'function',
					function: { name: '', arguments: '' }
				});
				if (tc.id) slot.id = tc.id;
				if (tc.function?.name) slot.function.name += tc.function.name;
				if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
			}
		}
	}

	const toolCalls = calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}` }));
	return {
		content,
		reasoning,
		toolCalls,
		finishReason,
		usage: {
			promptTokens: usage.prompt_tokens,
			completionTokens: usage.completion_tokens,
			cachedTokens: usage.cached_tokens,
			costUsd: costOf(req.model, usage.prompt_tokens, usage.completion_tokens, usage.cached_tokens),
			durationMs: Date.now() - started
		}
	};
}
