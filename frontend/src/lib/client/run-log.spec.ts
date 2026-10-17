import { describe, expect, it } from 'vitest';
import { buildRunLog, formatCost, formatDuration, formatPercent, type LogCall } from './run-log';

const call = (over: Partial<LogCall>): LogCall => ({
	id: 'u',
	model: 'openai/gpt-oss-120b',
	role: 'agent',
	promptTokens: 1000,
	completionTokens: 100,
	cachedTokens: 500,
	costUsd: 0.001,
	durationMs: 2000,
	createdAt: '2026-10-17T15:00:00.000Z',
	...over
});

const tc = (id: string, name: string) => ({
	id,
	type: 'function' as const,
	function: { name, arguments: '{}' }
});

describe('buildRunLog', () => {
	it('pairs agent calls with assistant messages and flags failed tools and slow calls', () => {
		const { rows, totals } = buildRunLog({
			calls: [
				call({ id: 'u1' }),
				call({
					id: 'u2',
					createdAt: new Date('2026-10-17T15:00:05.000Z'),
					durationMs: 12_000,
					cachedTokens: 900
				})
			],
			messages: [
				{ seq: 1, role: 'user', content: 'hi', toolCalls: null, toolCallId: null, meta: null },
				{
					seq: 2,
					role: 'assistant',
					content: null,
					toolCalls: [tc('a', 'set_plan'), tc('b', 'create_form')],
					toolCallId: null,
					meta: null
				},
				{ seq: 3, role: 'tool', content: 'ok', toolCalls: null, toolCallId: 'a', meta: null },
				{
					seq: 4,
					role: 'tool',
					content: JSON.stringify({ ok: false, error: 'bad spec' }),
					toolCalls: null,
					toolCallId: 'b',
					meta: null
				},
				{
					seq: 5,
					role: 'assistant',
					content: 'Done',
					toolCalls: null,
					toolCallId: null,
					meta: null
				},
				{
					seq: 6,
					role: 'assistant',
					content: 'boom',
					toolCalls: null,
					toolCallId: null,
					meta: { kind: 'error' }
				}
			],
			artifacts: []
		});
		expect(rows.map((r) => r.tools.map((t) => [t.name, t.failed]))).toEqual([
			[
				['set_plan', false],
				['create_form', true]
			],
			[]
		]);
		expect(rows[0].tools[1].error).toBe('bad spec');
		expect(rows.map((r) => r.slow)).toEqual([false, true]);
		expect(totals).toMatchObject({
			calls: 2,
			promptTokens: 2000,
			cachedTokens: 1400,
			slow: 1,
			failedTools: 1,
			cacheHit: 0.7
		});
	});

	it('links sub-agent calls to the artifact version they produced', () => {
		const { rows } = buildRunLog({
			calls: [
				call({ id: 's1', role: 'subagent', model: 'fast', costUsd: 0.0002, durationMs: 900 }),
				call({ id: 's2', role: 'subagent', model: 'fast', costUsd: 0.0003, durationMs: 800 })
			],
			messages: [],
			artifacts: [
				{
					id: 'art_1',
					title: 'Brief',
					versions: [
						{
							version: 2,
							author: 'subagent',
							model: 'fast',
							costUsd: 0.0003,
							durationMs: 800,
							createdAt: '2026-10-17T15:00:01.000Z'
						}
					]
				},
				{
					id: 'art_2',
					title: 'Menu',
					versions: [
						{
							version: 3,
							author: 'subagent',
							model: 'fast',
							costUsd: 0.0002,
							durationMs: 900,
							createdAt: '2026-10-17T15:00:01.000Z'
						}
					]
				}
			]
		});
		expect(rows.map((r) => r.patched?.title)).toEqual(['Menu', 'Brief']);
	});
});

describe('formatters', () => {
	it('format durations, percentages and cost', () => {
		expect(formatDuration(450)).toBe('450 ms');
		expect(formatDuration(2345)).toBe('2.3 s');
		expect(formatDuration(12_600)).toBe('13 s');
		expect(formatPercent(null)).toBe('–');
		expect(formatPercent(0.734)).toBe('73%');
		expect(formatCost(0.0012)).toBe('$0.0012');
	});
});
