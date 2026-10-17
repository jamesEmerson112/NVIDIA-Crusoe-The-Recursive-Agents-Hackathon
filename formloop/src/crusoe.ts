// Minimal Crusoe Managed Inference client for the CLI loop. Ported from frontend/src/lib/server/crusoe.ts
// (that one reads its key through SvelteKit, so it can't be imported here): jittered backoff on 429/503,
// a per-model request pace under the RPM limit, and token/cost accounting.
import { getEnv } from './env.ts';
import { loadConfig, type Role } from './config.ts';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type Usage = {
	role: Role;
	model: string;
	prompt_tokens: number;
	completion_tokens: number;
	cached_tokens: number;
	cost: number;
	ms: number;
};

/** Every call this process made; the CLIs print a summary from it. */
export const usageLog: Usage[] = [];

/** USD per 1M tokens (input, output, cached), from /v1/models on 2026-10-17. Unknown models cost 0. */
const PRICES: Record<string, [number, number, number]> = {
	'openai/gpt-oss-120b': [0.05, 0.25, 0.05],
	'deepseek-ai/Deepseek-V4-Flash': [0.14, 0.28, 0.03],
	'deepseek-ai/DeepSeek-V4.1-Flash': [0.29, 1.2, 0.007],
	'deepseek-ai/DeepSeek-V4-Pro': [1.74, 3.48, 0.15],
	'zai-org/GLM-5.3-Flash': [0.15, 0.5, 0.03]
};

export const hasCrusoeKey = () => Boolean(getEnv('CRUSOE_API_KEY'));

const nextSlot = new Map<string, number>();

/** Space requests to the same model so we stay under config.rpm. */
async function pace(model: string, rpm: number) {
	const gap = 60_000 / rpm;
	const now = Date.now();
	const at = Math.max(now, nextSlot.get(model) ?? 0);
	nextSlot.set(model, at + gap);
	if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(
	role: Role,
	messages: ChatMessage[],
	opts: { maxTokens?: number } = {}
): Promise<{ content: string; usage: Usage }> {
	const key = getEnv('CRUSOE_API_KEY');
	if (!key) throw new Error('CRUSOE_API_KEY is not set (run frontend `node scripts/set-key.mjs`), or pass --offline');
	const cfg = loadConfig();
	const rc = cfg.roles[role];
	const body = {
		model: rc.model,
		messages,
		max_tokens: opts.maxTokens ?? rc.max_tokens,
		temperature: rc.temperature ?? 0,
		...rc.extra
	};
	const started = Date.now();
	let lastError = '';
	for (let attempt = 0; attempt < 6; attempt++) {
		await pace(rc.model, cfg.rpm);
		let res: Response;
		try {
			res = await fetch(`${cfg.base_url}/chat/completions`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		} catch (e) {
			lastError = `network: ${(e as Error).message}`;
			await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
			continue;
		}
		if (res.status === 429 || res.status >= 500) {
			lastError = `${res.status} ${(await res.text()).slice(0, 200)}`;
			await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
			continue;
		}
		if (!res.ok) throw new Error(`Crusoe ${res.status} for ${rc.model}: ${(await res.text()).slice(0, 300)}`);
		const json = (await res.json()) as {
			choices: { message: { content: string | null }; finish_reason: string }[];
			usage?: {
				prompt_tokens: number;
				completion_tokens: number;
				prompt_tokens_details?: { cached_tokens?: number };
			};
		};
		const choice = json.choices[0];
		const content = choice?.message?.content ?? '';
		const u = json.usage;
		const cachedTokens = u?.prompt_tokens_details?.cached_tokens ?? 0;
		const [pin, pout, pcache] = PRICES[rc.model] ?? [0, 0, 0];
		const usage: Usage = {
			role,
			model: rc.model,
			prompt_tokens: u?.prompt_tokens ?? 0,
			completion_tokens: u?.completion_tokens ?? 0,
			cached_tokens: cachedTokens,
			cost:
				(((u?.prompt_tokens ?? 0) - cachedTokens) * pin +
					cachedTokens * pcache +
					(u?.completion_tokens ?? 0) * pout) /
				1e6,
			ms: Date.now() - started
		};
		usageLog.push(usage);
		if (!content.trim()) {
			throw new Error(
				`${rc.model} returned empty content (finish_reason ${choice?.finish_reason}); ` +
					(choice?.finish_reason === 'length' ? 'raise max_tokens or lower reasoning effort' : 'check the prompt')
			);
		}
		return { content, usage };
	}
	throw new Error(`Crusoe ${rc.model} failed after retries: ${lastError}`);
}

/** Pull the first JSON object or array out of a reply (models wrap JSON in prose or code fences). */
export function parseJSON<T>(text: string): T {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const src = fenced ? fenced[1] : text;
	const start = src.search(/[[{]/);
	if (start < 0) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
	const open = src[start];
	const close = open === '{' ? '}' : ']';
	const end = src.lastIndexOf(close);
	return JSON.parse(src.slice(start, end + 1)) as T;
}

export async function chatJSON<T>(
	role: Role,
	system: string,
	user: string,
	opts: { maxTokens?: number } = {}
): Promise<{ data: T; usage: Usage }> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: system },
		{ role: 'user', content: user }
	];
	const first = await chat(role, messages, opts);
	try {
		return { data: parseJSON<T>(first.content), usage: first.usage };
	} catch (e) {
		// One repair attempt: show the model its own output and the parse error.
		const retry = await chat(
			role,
			[
				...messages,
				{ role: 'assistant', content: first.content },
				{ role: 'user', content: `That was not valid JSON (${(e as Error).message}). Reply with only the JSON.` }
			],
			opts
		);
		return { data: parseJSON<T>(retry.content), usage: retry.usage };
	}
}

export function usageSummary(): string {
	if (!usageLog.length) return 'LLM calls: 0 (offline)';
	const by = new Map<string, { calls: number; tokens: number; cached: number; prompt: number; cost: number }>();
	for (const u of usageLog) {
		const k = `${u.role} ${u.model}`;
		const s = by.get(k) ?? { calls: 0, tokens: 0, cached: 0, prompt: 0, cost: 0 };
		s.calls++;
		s.tokens += u.prompt_tokens + u.completion_tokens;
		s.cached += u.cached_tokens;
		s.prompt += u.prompt_tokens;
		s.cost += u.cost;
		by.set(k, s);
	}
	const total = usageLog.reduce((a, u) => a + u.cost, 0);
	const lines = [...by].map(
		([k, s]) =>
			`  ${k}: ${s.calls} calls, ${s.tokens} tokens, ${s.prompt ? Math.round((100 * s.cached) / s.prompt) : 0}% cached, $${s.cost.toFixed(4)}`
	);
	return [`LLM calls: ${usageLog.length}, $${total.toFixed(4)}`, ...lines].join('\n');
}
