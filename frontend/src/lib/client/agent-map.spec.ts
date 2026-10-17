import { describe, expect, it } from 'vitest';
import type { MessageMeta, ToolCall } from '#lib/types.ts';
import { deriveAgentMap, type MapArtifact, type MapMessage } from './agent-map';

let seq = 0;
const msg = (m: Partial<MapMessage> & Pick<MapMessage, 'role'>): MapMessage => ({
	id: `m${seq++}`,
	content: null,
	toolCalls: null,
	toolCallId: null,
	meta: null,
	...m
});
const call = (id: string, name: string, args: unknown = {}): ToolCall => ({
	id,
	type: 'function',
	function: { name, arguments: JSON.stringify(args) }
});
const user = (content: string) => msg({ role: 'user', content });
const turn = (...calls: ToolCall[]) => msg({ role: 'assistant', toolCalls: calls });
const result = (callId: string, data: Record<string, unknown>, meta: MessageMeta | null = null) =>
	msg({ role: 'tool', toolCallId: callId, content: JSON.stringify(data), meta });
const reply = (content: string) => msg({ role: 'assistant', content });
const meta = (m: MessageMeta, content = '') => msg({ role: 'user', content, meta: m });

const form: MapArtifact = {
	id: 'art_form',
	title: 'Project details',
	status: 'ready',
	versions: [{ version: 1, author: 'agent', model: 'zai-org/GLM-5.3-Flash', costUsd: 0.001 }]
};
const brief: MapArtifact = {
	id: 'art_brief',
	title: 'Project brief',
	status: 'ready',
	versions: [
		{ version: 2, author: 'subagent', model: 'deepseek-ai/Deepseek-V4-Flash', costUsd: 0.0004 },
		{ version: 1, author: 'agent', model: 'zai-org/GLM-5.3-Flash', costUsd: 0.002 }
	]
};

const start = () => [
	user('Plan a team offsite for 8 people in SF'),
	turn(call('c1', 'set_plan', { steps: [{}, {}, {}] }), call('c2', 'create_form', { title: 'x' })),
	result('c1', { ok: true }),
	result('c2', { ok: true, artifact_id: 'art_form' }, { kind: 'artifact', artifactId: 'art_form' }),
	reply('Fill in the form.')
];

const lanesOf = (map: ReturnType<typeof deriveAgentMap>) => map.lanes.map((l) => l.id);
const on = (map: ReturnType<typeof deriveAgentMap>, lane: string) =>
	map.nodes.filter((n) => n.lane === lane);

describe('deriveAgentMap', () => {
	it('is empty for an empty conversation', () => {
		const map = deriveAgentMap({ messages: [], artifacts: [] });
		expect(map.nodes).toEqual([]);
		expect(map.lanes).toEqual([]);
	});

	it('draws goal, plan, a builder branch and a checked final answer', () => {
		const map = deriveAgentMap({ messages: start(), artifacts: [form] });
		const trunk = on(map, 'trunk');
		expect(trunk.map((n) => n.label)).toEqual(['Goal', 'Plan', 'Final answer']);
		expect(trunk[0].column).toBe('INTENT');
		expect(trunk[1]).toMatchObject({ column: 'PLAN', caption: '3 steps · 1 delegated' });
		expect(trunk[2]).toMatchObject({ column: 'DELIVER', shape: 'check' });
		const [built] = on(map, 'builder');
		expect(built).toMatchObject({ artifactId: 'art_form', column: 'DELEGATE', shape: 'check' });
		expect(on(map, 'critic')[0]).toMatchObject({ label: 'Self-check passed', column: 'VERIFY' });
		expect(lanesOf(map)).not.toContain('research');
		expect(lanesOf(map)).not.toContain('patch');
		// Branches sit above (builder, critic) and below the trunk.
		expect(map.lanes.find((l) => l.id === 'builder')!.row).toBe(-1);
		expect(map.lanes.find((l) => l.id === 'critic')!.row).toBe(-2);
		expect(map.columns.map((c) => c.column)).toEqual([
			'INTENT',
			'PLAN',
			'DELEGATE',
			'VERIFY',
			'DELIVER'
		]);
	});

	it('puts quick_edit sub-agents on the patch lane with model and cost', () => {
		const messages = [
			...start(),
			meta({ kind: 'artifact_edit', artifactId: 'art_form', version: 2, staleIds: ['art_brief'] }),
			turn(
				call('q1', 'quick_edit', { artifact_id: 'art_brief' }),
				call('q2', 'quick_edit', { artifact_id: 'art_brief' })
			),
			result('q1', { ok: true, artifact_id: 'art_brief', version: 2 }),
			result('q2', { ok: false, error: 'Sub-agent failed: timeout' }),
			reply('Patched.')
		];
		const map = deriveAgentMap({ messages, artifacts: [form, brief] });
		const patch = on(map, 'patch');
		expect(patch).toHaveLength(2);
		expect(patch[0]).toMatchObject({
			caption: 'v2 · Deepseek-V4-Flash · $0.0004',
			artifactId: 'art_brief',
			shape: 'check',
			sub: 0
		});
		expect(patch[1]).toMatchObject({ label: 'Failed', shape: 'x', sub: 1 });
		expect(map.lanes.find((l) => l.id === 'patch')!.caption).toBe('Sub-agent on Deepseek-V4-Flash');
		const [edit] = on(map, 'user');
		expect(edit).toMatchObject({ label: 'Edited Project details', caption: 'v2 · 1 stale' });
		// The edit merges into the next trunk node.
		const next = on(map, 'trunk').find((n) => n.x > edit.x)!;
		expect(map.edges).toContainEqual({ from: edit.id, to: next.id, color: 'user' });
	});

	it('shows a rejected self-check as a red X and the retry on the trunk', () => {
		const messages = [
			user('Write a brief'),
			reply('Done, see art_missing.'),
			meta({ kind: 'check', problems: ['art_missing does not exist'] }),
			turn(call('a1', 'create_artifact', { title: 'Brief' })),
			result(
				'a1',
				{ ok: true, artifact_id: 'art_brief' },
				{ kind: 'artifact', artifactId: 'art_brief' }
			),
			reply('Done, see art_brief.')
		];
		const map = deriveAgentMap({ messages, artifacts: [brief] });
		const critic = on(map, 'critic');
		expect(critic[0]).toMatchObject({
			label: 'Rejected',
			shape: 'x',
			caption: 'art_missing does not exist'
		});
		expect(critic.at(-1)).toMatchObject({ label: 'Self-check passed', shape: 'check' });
		expect(on(map, 'trunk').map((n) => n.label)).toEqual([
			'Goal',
			'Draft reply',
			'Delegate',
			'Final answer'
		]);
	});

	it('ends a declined redo in a red X and an approved one in a check', () => {
		const proposal = (id: string): MessageMeta => ({
			kind: 'proposal',
			callId: id,
			artifactIds: ['art_brief'],
			summary: '',
			plan: '',
			costUsd: 0.0021,
			durationMs: 20000
		});
		const messages = [
			...start(),
			turn(call('p1', 'propose_redo', { artifact_ids: ['art_brief'] })),
			result('p1', { ok: true }, proposal('p1')),
			meta({ kind: 'proposal_reply', callId: 'p1', approved: false }),
			turn(call('p2', 'propose_redo', { artifact_ids: ['art_brief'] })),
			result('p2', { ok: true }, proposal('p2')),
			meta({ kind: 'proposal_reply', callId: 'p2', approved: true }),
			turn(call('q1', 'quick_edit', { artifact_id: 'art_brief' })),
			result('q1', { ok: true, artifact_id: 'art_brief', version: 2 })
		];
		const map = deriveAgentMap({ messages, artifacts: [form, brief] });
		const revised = on(map, 'revised');
		expect(revised.map((n) => [n.label, n.shape])).toEqual([
			['Redo proposed', 'hollow'],
			['Rejected', 'x'],
			['Redo proposed', 'hollow'],
			['Approved redo', 'check'],
			['Project brief', 'check']
		]);
		expect(revised[0].caption).toBe('$0.0021 · 20s est.');
		expect(map.edges).toContainEqual({ from: revised[0].id, to: revised[1].id, color: 'revised' });
		expect(lanesOf(map)).not.toContain('patch');
	});

	it('adds a research lane only when a research tool ran', () => {
		const messages = [
			user('Find venues'),
			turn(call('r1', 'spawn_research', { title: 'Venues in SF' })),
			result('r1', { ok: true })
		];
		const map = deriveAgentMap({ messages, artifacts: [] });
		expect(map.lanes.find((l) => l.id === 'research')).toMatchObject({ label: 'Research agent' });
		expect(on(map, 'research')[0].label).toBe('Venues in SF');
	});

	it('appends a live node at the head of the trunk while running', () => {
		const map = deriveAgentMap(
			{ messages: [user('Plan an offsite')], artifacts: [] },
			{ running: true, status: 'Thinking', activity: ['Planned 3 steps'] }
		);
		expect(map.live).toBe(true);
		expect(on(map, 'trunk').at(-1)).toMatchObject({
			shape: 'live',
			label: 'Thinking',
			caption: 'Planned 3 steps'
		});
	});
});
