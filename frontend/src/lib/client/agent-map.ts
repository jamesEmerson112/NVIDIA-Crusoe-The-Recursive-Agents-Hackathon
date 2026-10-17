// Derives the "agent multiverse" map (AgentMap.svelte) from a conversation's stored messages
// and artifacts. Pure: no Svelte, no DB, so it is unit-tested and re-derives on every invalidate.
import type { MessageMeta, ToolCall } from '#lib/types.ts';

export const COLUMNS = ['INTENT', 'PLAN', 'DELEGATE', 'VERIFY', 'DELIVER'] as const;
export type Column = (typeof COLUMNS)[number];

/** Lane color keys; AgentMap.svelte maps them to CSS variables (light and dark). */
export type LaneColor =
	'trunk' | 'builder' | 'patch' | 'critic' | 'revised' | 'research' | 'user' | 'other';

export interface MapLane {
	id: string;
	label: string;
	caption: string;
	color: LaneColor;
	/** 0 is the trunk; negative rows sit above it, positive below. */
	row: number;
}

export type NodeShape = 'hollow' | 'check' | 'x' | 'live' | 'dot';

export interface MapNode {
	id: string;
	lane: string;
	/** Time order, left to right; every node has its own x. */
	x: number;
	/** Row offset from the lane's row, for parallel items in one turn. */
	sub: number;
	column: Column;
	label: string;
	caption: string;
	shape: NodeShape;
	artifactId?: string;
}

export interface MapEdge {
	from: string;
	to: string;
	color: LaneColor;
}

export interface AgentMap {
	lanes: MapLane[];
	nodes: MapNode[];
	edges: MapEdge[];
	/** Column header positions: the first x of each run of nodes tagged with the same column. */
	columns: { column: Column; x: number }[];
	width: number;
	live: boolean;
}

// Structural input, compatible with ConversationState, so tests don't need the database.
export interface MapMessage {
	id: string;
	role: 'user' | 'assistant' | 'tool';
	content: string | null;
	toolCalls: ToolCall[] | null;
	toolCallId: string | null;
	meta: MessageMeta | null;
}
export interface MapVersion {
	version: number;
	author: 'agent' | 'user' | 'subagent';
	model: string | null;
	costUsd: number;
}
export interface MapArtifact {
	id: string;
	title: string;
	status: string;
	versions: MapVersion[];
}
export interface MapInput {
	messages: MapMessage[];
	artifacts: MapArtifact[];
}
export interface LiveInput {
	running: boolean;
	status: string;
	activity: string[];
}

interface LaneDef {
	label: string;
	caption: string;
	color: LaneColor;
	/** Preferred side and distance from the trunk; rows are compacted afterwards. */
	pref: number;
}

const LANES: Record<string, LaneDef> = {
	trunk: {
		label: 'Main orchestrator',
		caption: 'Goal → plan → tools → result',
		color: 'trunk',
		pref: 0
	},
	builder: {
		label: 'Artifact builder',
		caption: 'Draft forms, documents and HTML',
		color: 'builder',
		pref: -1
	},
	critic: {
		label: 'Critic / self-check',
		caption: 'Check outputs against saved artifacts',
		color: 'critic',
		pref: -2
	},
	research: {
		label: 'Research agent',
		caption: 'Find evidence and constraints',
		color: 'research',
		pref: -3
	},
	patch: { label: 'Fast patch worker', caption: 'Cheap parallel edits', color: 'patch', pref: 1 },
	revised: {
		label: 'Revised artifact',
		caption: 'Redo proposals you approve or reject',
		color: 'revised',
		pref: 2
	},
	user: {
		label: 'You',
		caption: 'Answers and edits re-enter the trunk',
		color: 'user',
		pref: 3
	}
};

const BUILDER_TOOLS = new Set(['create_form', 'create_artifact', 'update_artifact']);
/** Tools that only touch the plan or read memory: folded into the trunk node's caption. */
const TRUNK_TOOLS = new Set(['set_plan', 'update_step', 'read_artifact']);

const clip = (s: string, n: number) => {
	const t = s.replace(/\s+/g, ' ').trim();
	return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const parse = (s: string | null): Record<string, unknown> => {
	try {
		const v = JSON.parse(s ?? '');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
};
const shortModel = (m: string | null) => (m ? m.split('/').pop()! : '');
const money = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
const humanize = (name: string) => name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Lane for a tool that isn't known yet: research sub-agents get the research lane. */
function laneForUnknown(name: string): { id: string; def: LaneDef } {
	if (/research/i.test(name)) return { id: 'research', def: LANES.research };
	return {
		id: `tool:${name}`,
		def: { label: humanize(name), caption: 'Tool calls', color: 'other', pref: -4 }
	};
}

export function deriveAgentMap(cs: MapInput, live?: LiveInput | null): AgentMap {
	const nodes: MapNode[] = [];
	const edges: MapEdge[] = [];
	const laneDefs = new Map<string, LaneDef>();
	const artifacts = new Map(cs.artifacts.map((a) => [a.id, a]));
	const results = new Map(
		cs.messages.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => [m.toolCallId!, m])
	);
	const proposals = new Map<string, string>(); // callId -> node id
	let x = 0;
	let trunkPrev: string | null = null;
	let merge: string | null = null; // a user-lane node that feeds the next trunk node
	let redoActive = false; // after an approved redo, the agent's edits land on the revised lane
	let goals = 0;
	let patchModel = '';

	const lane = (id: string, def: LaneDef) => {
		if (!laneDefs.has(id)) laneDefs.set(id, def);
		return id;
	};
	const add = (n: Omit<MapNode, 'id' | 'x' | 'sub'> & { sub?: number }) => {
		const node: MapNode = { sub: 0, ...n, id: `n${x}`, x: x++ };
		nodes.push(node);
		return node;
	};
	const color = (laneId: string) => laneDefs.get(laneId)?.color ?? 'other';
	const link = (from: string | null, to: MapNode) => {
		if (from) edges.push({ from, to: to.id, color: color(to.lane) });
	};
	const laneOf = (id: string) => nodes.find((n) => n.id === id)?.lane ?? 'trunk';
	const trunk = (n: Omit<MapNode, 'id' | 'x' | 'sub' | 'lane'>) => {
		const node = add({ ...n, lane: lane('trunk', LANES.trunk) });
		if (trunkPrev) edges.push({ from: trunkPrev, to: node.id, color: 'trunk' });
		if (merge) edges.push({ from: merge, to: node.id, color: color(laneOf(merge)) });
		merge = null;
		trunkPrev = node.id;
		return node;
	};

	for (let i = 0; i < cs.messages.length; i++) {
		const m = cs.messages[i];
		const meta = m.meta;

		if (m.role === 'user') {
			if (!meta) {
				redoActive = false;
				trunk({
					column: 'INTENT',
					label: goals++ ? 'Follow-up' : 'Goal',
					caption: clip(m.content ?? '', 26),
					shape: 'hollow'
				});
			} else if (meta.kind === 'form_submit' || meta.kind === 'artifact_edit') {
				redoActive = false;
				const title = artifacts.get(meta.artifactId)?.title ?? 'artifact';
				const stale = meta.kind === 'artifact_edit' ? meta.staleIds.length : 0;
				const node = add({
					lane: lane('user', LANES.user),
					column: 'INTENT',
					label: `${meta.kind === 'form_submit' ? 'Submitted' : 'Edited'} ${clip(title, 18)}`,
					caption: `v${meta.version}${stale ? ` · ${stale} stale` : ''}`,
					shape: 'dot',
					artifactId: meta.artifactId
				});
				merge = node.id;
			} else if (meta.kind === 'proposal_reply') {
				const from = proposals.get(meta.callId) ?? null;
				const node = add({
					lane: lane('revised', LANES.revised),
					column: 'VERIFY',
					label: meta.approved ? 'Approved redo' : 'Rejected',
					caption: meta.approved ? 'Agent redoes the work' : 'Kept current version',
					shape: meta.approved ? 'check' : 'x'
				});
				link(from, node);
				redoActive = meta.approved;
			}
			// 'check' messages are consumed with the reply they rejected (below).
			continue;
		}

		if (m.role === 'assistant' && meta?.kind === 'error') {
			trunk({
				column: 'DELIVER',
				label: 'Run failed',
				caption: clip(m.content ?? '', 26),
				shape: 'x'
			});
			continue;
		}

		if (m.role === 'assistant' && m.toolCalls?.length) {
			const calls = m.toolCalls;
			const names = calls.map((c) => c.function.name);
			const plan = calls.find((c) => c.function.name === 'set_plan');
			const steps = names.filter((n) => n === 'update_step').length;
			const reads = names.filter((n) => n === 'read_artifact').length;
			const delegated = calls.filter((c) => !TRUNK_TOOLS.has(c.function.name));
			const captionBits = [
				plan
					? `${(parse(plan.function.arguments).steps as unknown[] | undefined)?.length ?? 0} steps`
					: '',
				steps && !plan ? `${steps} step update${steps > 1 ? 's' : ''}` : '',
				reads ? `read ${reads} artifact${reads > 1 ? 's' : ''}` : '',
				delegated.length ? `${delegated.length} delegated` : ''
			].filter(Boolean);
			const head = trunk({
				column: plan || !delegated.length ? 'PLAN' : 'DELEGATE',
				label: plan ? 'Plan' : delegated.length ? 'Delegate' : 'Update plan',
				caption: captionBits.join(' · '),
				shape: 'hollow'
			});

			const perLane = new Map<string, number>();
			for (const c of delegated) {
				const name = c.function.name;
				const args = parse(c.function.arguments);
				const res = results.get(c.id);
				const out = parse(res?.content ?? null);
				const failed = out.ok === false;
				const artifactId =
					(res?.meta?.kind === 'artifact' ? res.meta.artifactId : undefined) ??
					(typeof out.artifact_id === 'string' ? out.artifact_id : undefined) ??
					(typeof args.artifact_id === 'string' ? args.artifact_id : undefined);
				const art = artifactId ? artifacts.get(artifactId) : undefined;
				const title = clip(art?.title ?? String(args.title ?? humanize(name)), 18);

				let laneId: string;
				let column: Column = 'DELEGATE';
				let label = title;
				let caption = '';
				if (name === 'propose_redo') {
					laneId = lane('revised', LANES.revised);
					column = 'VERIFY';
					label = 'Redo proposed';
					const p = res?.meta?.kind === 'proposal' ? res.meta : null;
					caption = p ? `${money(p.costUsd)} · ${Math.round(p.durationMs / 1000)}s est.` : '';
				} else if (name === 'mark_fresh') {
					laneId = lane('critic', LANES.critic);
					column = 'VERIFY';
					label = 'Still up to date';
					caption = `${(args.artifact_ids as unknown[] | undefined)?.length ?? 0} artifact(s) kept`;
				} else if (redoActive && (name === 'quick_edit' || name === 'update_artifact')) {
					laneId = lane('revised', LANES.revised);
					caption = name === 'quick_edit' ? 'Redone by sub-agent' : 'Redone';
				} else if (name === 'quick_edit') {
					laneId = lane('patch', LANES.patch);
					const v = art?.versions.find((v) => v.version === Number(out.version));
					if (v?.model) patchModel = shortModel(v.model);
					caption = v
						? `v${v.version} · ${shortModel(v.model)} · ${money(v.costUsd)}`
						: 'Sub-agent patch';
				} else if (BUILDER_TOOLS.has(name)) {
					laneId = lane('builder', LANES.builder);
					caption =
						name === 'create_form'
							? 'Form for you'
							: name === 'update_artifact'
								? `Updated${out.version ? ` to v${out.version}` : ''}`
								: 'New artifact';
					if (art?.status === 'stale') caption += ' · stale';
				} else {
					const u = laneForUnknown(name);
					laneId = lane(u.id, u.def);
					caption = humanize(name);
				}
				if (failed) {
					label = 'Failed';
					caption = clip(String(out.error ?? name), 24);
				}
				const k = perLane.get(laneId) ?? 0;
				perLane.set(laneId, k + 1);
				const node = add({
					lane: laneId,
					column,
					label,
					caption,
					shape: failed ? 'x' : 'hollow',
					sub: k,
					artifactId: failed ? undefined : artifactId
				});
				link(head.id, node);
				if (name === 'propose_redo') proposals.set(c.id, node.id);
			}
			continue;
		}

		if (m.role === 'assistant' && m.content) {
			const next = cs.messages[i + 1];
			const before = trunkPrev;
			if (next?.role === 'user' && next.meta?.kind === 'check') {
				// The self-check rejected this reply: the agent goes back to work on the trunk.
				const draft = trunk({
					column: 'DELIVER',
					label: 'Draft reply',
					caption: clip(m.content, 26),
					shape: 'hollow'
				});
				const node = add({
					lane: lane('critic', LANES.critic),
					column: 'VERIFY',
					label: 'Rejected',
					caption: clip(next.meta.problems[0] ?? 'Check failed', 26),
					shape: 'x'
				});
				link(draft.id, node);
				i++;
			} else {
				const check = add({
					lane: lane('critic', LANES.critic),
					column: 'VERIFY',
					label: 'Self-check passed',
					caption: 'References verified',
					shape: 'hollow'
				});
				link(before, check);
				merge = check.id;
				trunk({
					column: 'DELIVER',
					label: 'Final answer',
					caption: clip(m.content, 26),
					shape: 'check'
				});
			}
		}
	}

	if (live?.running) {
		trunk({
			column: 'DELIVER',
			label: live.status || 'Working',
			caption: clip(live.activity.at(-1) ?? '', 26),
			shape: 'live'
		});
	}

	// Each branch lane's last surviving node is its result: draw it as a filled check.
	for (const id of laneDefs.keys()) {
		if (id === 'trunk' || id === 'user') continue;
		const last = nodes.filter((n) => n.lane === id && n.shape !== 'x').at(-1);
		if (last) last.shape = 'check';
	}

	if (patchModel) laneDefs.set('patch', { ...LANES.patch, caption: `Sub-agent on ${patchModel}` });

	// Compact rows: lanes above the trunk get -1, -2, ...; below get 1, 2, ... by preference.
	const entries = [...laneDefs.entries()];
	const above = entries.filter(([, d]) => d.pref < 0).sort((a, b) => b[1].pref - a[1].pref);
	const below = entries.filter(([, d]) => d.pref > 0).sort((a, b) => a[1].pref - b[1].pref);
	const rows = new Map<string, number>([['trunk', 0]]);
	// Leave room for parallel sub-rows.
	const depth = (id: string) =>
		Math.max(0, ...nodes.filter((n) => n.lane === id).map((n) => n.sub)) * 0.55;
	for (const side of [above, below]) {
		const sign = side === above ? -1 : 1;
		let r = 0;
		let prev = '';
		for (const [id] of side) {
			r += 1 + (prev ? depth(prev) : 0);
			rows.set(id, sign * r);
			prev = id;
		}
	}
	const lanes: MapLane[] = entries
		.filter(([id]) => rows.has(id))
		.map(([id, d]) => ({
			id,
			label: d.label,
			caption: d.caption,
			color: d.color,
			row: rows.get(id)!
		}));

	const columns: AgentMap['columns'] = [];
	for (const n of nodes)
		if (columns.at(-1)?.column !== n.column) columns.push({ column: n.column, x: n.x });

	return { lanes, nodes, edges, columns, width: x, live: !!live?.running };
}
