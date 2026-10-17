// Derives the run log (RunLog.svelte): one row per model call, joined to what that call did.
// Pure: no Svelte, no DB. Inputs are structural so tests can pass plain objects; timestamps may be
// Date objects (load data) or ISO strings (JSON API).
import type { MessageMeta, ToolCall } from '#lib/types.ts';

type Time = Date | string | number;

export interface LogCall {
	id: string;
	model: string;
	role: 'agent' | 'subagent';
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number;
	durationMs: number;
	createdAt: Time;
}

export interface LogMessage {
	seq: number;
	role: 'user' | 'assistant' | 'tool';
	content: string | null;
	toolCalls: ToolCall[] | null;
	toolCallId: string | null;
	meta: MessageMeta | null | unknown;
}

export interface LogArtifact {
	id: string;
	title: string;
	versions: {
		version: number;
		author: 'agent' | 'user' | 'subagent';
		model: string | null;
		costUsd: number;
		durationMs: number;
		createdAt: Time;
	}[];
}

export interface RunLogRow extends LogCall {
	time: number;
	cacheHit: number | null; // 0..1, null when there were no prompt tokens
	slow: boolean;
	tools: { name: string; failed: boolean; error?: string }[];
	patched: { id: string; title: string; version: number } | null;
}

export interface RunLogTotals {
	calls: number;
	promptTokens: number;
	cachedTokens: number;
	completionTokens: number;
	costUsd: number;
	durationMs: number;
	cacheHit: number | null;
	slow: number;
	failedTools: number;
}

export const SLOW_MS = 10_000;

const ms = (t: Time) => new Date(t).getTime();

function toolError(content: string | null): string | undefined {
	if (!content) return undefined;
	try {
		const parsed = JSON.parse(content);
		if (parsed && typeof parsed === 'object' && parsed.ok === false)
			return String(parsed.error ?? 'failed');
	} catch {
		// Not JSON: tools return plain text on success too.
	}
	return undefined;
}

export function buildRunLog(input: {
	calls: LogCall[];
	messages: LogMessage[];
	artifacts: LogArtifact[];
}): { rows: RunLogRow[]; totals: RunLogTotals } {
	const calls = [...input.calls].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
	const messages = [...input.messages].sort((a, b) => a.seq - b.seq);

	// run.ts records usage right before appending the assistant message, so agent calls and
	// assistant messages pair up in order. Error rows come from the catch path with no usage row.
	const assistants = messages.filter(
		(m) => m.role === 'assistant' && (m.meta as MessageMeta | null)?.kind !== 'error'
	);
	const results = new Map(
		messages.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => [m.toolCallId!, m])
	);

	// subagent.ts records usage then adds a version with the same model, cost and duration.
	const subVersions = input.artifacts.flatMap((a) =>
		a.versions
			.filter((v) => v.author === 'subagent')
			.map((v) => ({ ...v, artifactId: a.id, title: a.title, time: ms(v.createdAt) }))
	);
	const claimed = new Set<(typeof subVersions)[number]>();

	let agentIndex = 0;
	const rows = calls.map((c): RunLogRow => {
		const time = ms(c.createdAt);
		let tools: RunLogRow['tools'] = [];
		let patched: RunLogRow['patched'] = null;
		if (c.role === 'agent') {
			const msg = assistants[agentIndex++];
			tools = (msg?.toolCalls ?? []).map((tc) => {
				const error = toolError(results.get(tc.id)?.content ?? null);
				return { name: tc.function.name, failed: error !== undefined, error };
			});
		} else {
			const match = subVersions
				.filter(
					(v) =>
						!claimed.has(v) &&
						v.model === c.model &&
						v.time >= time &&
						Math.abs(v.costUsd - c.costUsd) < 1e-12 &&
						v.durationMs === c.durationMs
				)
				.sort((a, b) => a.time - b.time)[0];
			if (match) {
				claimed.add(match);
				patched = { id: match.artifactId, title: match.title, version: match.version };
			}
		}
		return {
			...c,
			time,
			cacheHit: c.promptTokens ? c.cachedTokens / c.promptTokens : null,
			slow: c.durationMs > SLOW_MS,
			tools,
			patched
		};
	});

	const sum = (f: (r: RunLogRow) => number) => rows.reduce((s, r) => s + f(r), 0);
	const promptTokens = sum((r) => r.promptTokens);
	const cachedTokens = sum((r) => r.cachedTokens);
	return {
		rows,
		totals: {
			calls: rows.length,
			promptTokens,
			cachedTokens,
			completionTokens: sum((r) => r.completionTokens),
			costUsd: sum((r) => r.costUsd),
			durationMs: sum((r) => r.durationMs),
			cacheHit: promptTokens ? cachedTokens / promptTokens : null,
			slow: rows.filter((r) => r.slow).length,
			failedTools: sum((r) => r.tools.filter((t) => t.failed).length)
		}
	};
}

export const formatPercent = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);

export function formatDuration(ms: number) {
	if (ms < 1000) return `${ms} ms`;
	return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export const formatCost = (usd: number) => `$${usd.toFixed(usd > 0 && usd < 0.0001 ? 6 : 4)}`;

export const formatTokens = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export const shortModel = (model: string) => model.split('/').pop() ?? model;
