import { and, asc, desc, eq, inArray, like, max, or } from 'drizzle-orm';
import { db } from './db';
import {
	artifactDeps,
	artifactVersions,
	artifacts,
	conversations,
	messages,
	steps,
	usage
} from './db/schema';
import type { ChatMessage, Usage } from './crusoe';
import type {
	ArtifactKind,
	ArtifactStatus,
	MessageMeta,
	StepStatus,
	ToolCall
} from '#lib/types.ts';

// Short ids keep tool arguments cheap and easy for models to copy.
const shortId = (prefix: string) =>
	`${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;

export async function createConversation() {
	const [row] = await db
		.insert(conversations)
		.values({ id: shortId('c') })
		.returning();
	return row;
}

export async function listConversations() {
	return db.select().from(conversations).orderBy(desc(conversations.updatedAt));
}

export async function touchConversation(id: string, title?: string) {
	await db
		.update(conversations)
		.set({ updatedAt: new Date(), ...(title ? { title } : {}) })
		.where(eq(conversations.id, id));
}

export async function getConversation(id: string) {
	const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
	return row;
}

export async function deleteConversation(id: string) {
	await db.delete(conversations).where(eq(conversations.id, id));
}

// ---------- messages ----------

export async function appendMessage(
	conversationId: string,
	msg: {
		role: 'user' | 'assistant' | 'tool';
		content: string | null;
		toolCalls?: ToolCall[];
		toolCallId?: string;
	},
	meta?: MessageMeta
) {
	const [{ seq }] = await db
		.select({ seq: max(messages.seq) })
		.from(messages)
		.where(eq(messages.conversationId, conversationId));
	await db.insert(messages).values({
		conversationId,
		seq: (seq ?? 0) + 1,
		role: msg.role,
		content: msg.content,
		toolCalls: msg.toolCalls?.length ? msg.toolCalls : null,
		toolCallId: msg.toolCallId ?? null,
		meta: meta ?? null
	});
}

export async function listMessages(conversationId: string) {
	return db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(asc(messages.seq));
}

/** History in chat-completions format. Append-only, so the prefix stays cacheable (skill §8). */
export async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
	const rows = (await listMessages(conversationId)).filter((m) => m.meta?.kind !== 'error');
	return rows.map((m): ChatMessage => {
		if (m.role === 'tool')
			return { role: 'tool', content: m.content ?? '', tool_call_id: m.toolCallId! };
		if (m.role === 'assistant')
			return {
				role: 'assistant',
				content: m.content,
				...(m.toolCalls ? { tool_calls: m.toolCalls } : {})
			};
		return { role: 'user', content: m.content ?? '' };
	});
}

// ---------- process steps ----------

export async function listSteps(conversationId: string) {
	return db
		.select()
		.from(steps)
		.where(eq(steps.conversationId, conversationId))
		.orderBy(asc(steps.position));
}

/** Replace the plan, matching existing steps by position so artifacts stay attached. */
export async function setPlan(
	conversationId: string,
	plan: { title: string; status?: StepStatus }[]
) {
	const existing = await listSteps(conversationId);
	for (const [i, item] of plan.entries()) {
		const position = i + 1;
		const current = existing.find((s) => s.position === position);
		if (current) {
			await db
				.update(steps)
				.set({ title: item.title, status: item.status ?? current.status })
				.where(eq(steps.id, current.id));
		} else {
			await db.insert(steps).values({
				id: shortId('s'),
				conversationId,
				position,
				title: item.title,
				status: item.status ?? 'pending'
			});
		}
	}
	const extra = existing.filter((s) => s.position > plan.length).map((s) => s.id);
	if (extra.length) await db.delete(steps).where(inArray(steps.id, extra));
	return listSteps(conversationId);
}

export async function updateStep(
	conversationId: string,
	position: number,
	patch: { status?: StepStatus; summary?: string }
) {
	const [row] = await db
		.update(steps)
		.set(patch)
		.where(and(eq(steps.conversationId, conversationId), eq(steps.position, position)))
		.returning();
	return row;
}

async function stepIdFor(conversationId: string, position?: number) {
	if (!position) return null;
	const [row] = await db
		.select({ id: steps.id })
		.from(steps)
		.where(and(eq(steps.conversationId, conversationId), eq(steps.position, position)));
	return row?.id ?? null;
}

// ---------- artifacts ----------

export interface Provenance {
	author: 'agent' | 'user' | 'subagent';
	model?: string;
	costUsd?: number;
	durationMs?: number;
}

export async function createArtifact(input: {
	conversationId: string;
	kind: ArtifactKind;
	title: string;
	content: string;
	step?: number;
	dependsOn?: string[];
	status?: ArtifactStatus;
	provenance: Provenance;
}) {
	const id = shortId('art');
	await db.insert(artifacts).values({
		id,
		conversationId: input.conversationId,
		stepId: await stepIdFor(input.conversationId, input.step),
		kind: input.kind,
		title: input.title,
		status: input.status ?? 'ready'
	});
	await db.insert(artifactVersions).values({
		artifactId: id,
		version: 1,
		content: input.content,
		note: 'Created',
		...versionProvenance(input.provenance)
	});
	const upstream = await existingArtifactIds(input.conversationId, input.dependsOn ?? []);
	if (upstream.length) {
		await db
			.insert(artifactDeps)
			.values(upstream.map((upstreamId) => ({ upstreamId, downstreamId: id })));
	}
	return { id, linked: upstream };
}

function versionProvenance(p: Provenance) {
	return {
		author: p.author,
		model: p.model ?? null,
		costUsd: p.costUsd ?? 0,
		durationMs: p.durationMs ?? 0
	};
}

async function existingArtifactIds(conversationId: string, ids: string[]) {
	if (!ids.length) return [];
	const rows = await db
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(and(eq(artifacts.conversationId, conversationId), inArray(artifacts.id, ids)));
	return rows.map((r) => r.id);
}

export async function getArtifact(conversationId: string, id: string) {
	const [artifact] = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.conversationId, conversationId), eq(artifacts.id, id)));
	if (!artifact) return undefined;
	const [version] = await db
		.select()
		.from(artifactVersions)
		.where(
			and(
				eq(artifactVersions.artifactId, id),
				eq(artifactVersions.version, artifact.currentVersion)
			)
		);
	return { ...artifact, content: version.content, data: version.data, versionInfo: version };
}

/** Save a new version. Omitted content or data carries over from the current version. */
export async function addVersion(
	conversationId: string,
	id: string,
	patch: {
		content?: string;
		data?: Record<string, unknown> | null;
		note: string;
		status?: ArtifactStatus;
	},
	provenance: Provenance
) {
	const current = await getArtifact(conversationId, id);
	if (!current) throw new Error(`Unknown artifact ${id}`);
	const version = current.currentVersion + 1;
	await db.insert(artifactVersions).values({
		artifactId: id,
		version,
		content: patch.content ?? current.content,
		data: patch.data === undefined ? current.data : patch.data,
		note: patch.note,
		...versionProvenance(provenance)
	});
	await db
		.update(artifacts)
		.set({ currentVersion: version, status: patch.status ?? 'ready', updatedAt: new Date() })
		.where(eq(artifacts.id, id));
	await syncStepStatus([id]);
	return { previous: current, version };
}

export async function renameArtifact(id: string, title: string) {
	await db.update(artifacts).set({ title, updatedAt: new Date() }).where(eq(artifacts.id, id));
}

export async function setArtifactStatus(ids: string[], status: ArtifactStatus) {
	if (!ids.length) return;
	await db
		.update(artifacts)
		.set({ status, updatedAt: new Date() })
		.where(inArray(artifacts.id, ids));
	await syncStepStatus(ids);
}

/**
 * A finished step whose artifacts went out of date shows as stale in the process, and returns
 * to done once none of them are stale. Pending and active steps keep their status.
 */
async function syncStepStatus(artifactIds: string[]) {
	const rows = await db
		.select({ stepId: artifacts.stepId })
		.from(artifacts)
		.where(inArray(artifacts.id, artifactIds));
	const stepIds = [...new Set(rows.map((r) => r.stepId).filter((s): s is string => !!s))];
	for (const stepId of stepIds) {
		const [step] = await db.select().from(steps).where(eq(steps.id, stepId));
		if (!step || (step.status !== 'done' && step.status !== 'stale')) continue;
		const inStep = await db
			.select({ status: artifacts.status })
			.from(artifacts)
			.where(eq(artifacts.stepId, stepId));
		const status = inStep.some((a) => a.status === 'stale' || a.status === 'updating')
			? 'stale'
			: 'done';
		if (status !== step.status) await db.update(steps).set({ status }).where(eq(steps.id, stepId));
	}
}

export async function listVersions(artifactId: string) {
	return db
		.select()
		.from(artifactVersions)
		.where(eq(artifactVersions.artifactId, artifactId))
		.orderBy(desc(artifactVersions.version));
}

/** Every artifact transitively built from `id`, nearest first. */
export async function downstreamOf(id: string) {
	const seen = new Set<string>();
	let frontier = [id];
	while (frontier.length) {
		const rows = await db
			.select({ id: artifactDeps.downstreamId })
			.from(artifactDeps)
			.where(inArray(artifactDeps.upstreamId, frontier));
		frontier = rows.map((r) => r.id).filter((d) => d !== id && !seen.has(d));
		frontier.forEach((d) => seen.add(d));
	}
	return [...seen];
}

export async function upstreamOf(id: string) {
	const rows = await db
		.select({ id: artifactDeps.upstreamId })
		.from(artifactDeps)
		.where(eq(artifactDeps.downstreamId, id));
	return rows.map((r) => r.id);
}

/**
 * Redo estimate for a set of artifacts: what their latest agent-made versions cost to produce.
 * A rough but grounded number to put in front of the agent and the user.
 */
export async function estimateRedo(conversationId: string, ids: string[]) {
	const items = [];
	for (const id of ids) {
		const a = await getArtifact(conversationId, id);
		if (!a) continue;
		const versions = await listVersions(id);
		// A full redo costs about what the most expensive generation did, not the last cheap patch.
		const made = versions.filter((v) => v.author !== 'user');
		const produced = made.length
			? made.reduce((m, v) => (v.costUsd > m.costUsd ? v : m))
			: a.versionInfo;
		items.push({
			id,
			title: a.title,
			kind: a.kind,
			costUsd: produced.costUsd,
			durationMs: produced.durationMs
		});
	}
	return {
		items,
		costUsd: items.reduce((s, i) => s + i.costUsd, 0),
		durationMs: items.reduce((s, i) => s + i.durationMs, 0)
	};
}

// ---------- usage ----------

export async function recordUsage(
	conversationId: string,
	model: string,
	role: 'agent' | 'subagent',
	u: Usage
) {
	await db.insert(usage).values({ conversationId, model, role, ...u });
}

export async function usageTotals(conversationId: string) {
	const rows = await db.select().from(usage).where(eq(usage.conversationId, conversationId));
	return {
		calls: rows.length,
		costUsd: rows.reduce((s, r) => s + r.costUsd, 0),
		promptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
		cachedTokens: rows.reduce((s, r) => s + r.cachedTokens, 0),
		completionTokens: rows.reduce((s, r) => s + r.completionTokens, 0)
	};
}

// ---------- full snapshot for the UI ----------

export async function conversationState(id: string) {
	const conversation = await getConversation(id);
	if (!conversation) return undefined;
	const [msgs, stepRows, artifactRows] = await Promise.all([
		listMessages(id),
		listSteps(id),
		db
			.select()
			.from(artifacts)
			.where(eq(artifacts.conversationId, id))
			.orderBy(asc(artifacts.createdAt))
	]);
	const ids = artifactRows.map((a) => a.id);
	const [versionRows, depRows] = ids.length
		? await Promise.all([
				db
					.select()
					.from(artifactVersions)
					.where(inArray(artifactVersions.artifactId, ids))
					.orderBy(desc(artifactVersions.version)),
				db.select().from(artifactDeps).where(inArray(artifactDeps.downstreamId, ids))
			])
		: [[], []];
	return {
		conversation,
		messages: msgs,
		steps: stepRows,
		artifacts: artifactRows.map((a) => ({
			...a,
			versions: versionRows.filter((v) => v.artifactId === a.id),
			upstream: depRows.filter((d) => d.downstreamId === a.id).map((d) => d.upstreamId)
		})),
		usage: await usageTotals(id)
	};
}

export type ConversationState = NonNullable<Awaited<ReturnType<typeof conversationState>>>;

// ---------- library: every artifact across conversations ----------

/** Current versions of all artifacts, newest first, optionally filtered by title, content or answers. */
export async function searchArtifacts(query: string, kind?: ArtifactKind) {
	// SQLite LIKE is case-insensitive for ASCII; % and _ in the query act as wildcards.
	const pattern = `%${query}%`;
	const rows = await db
		.select({
			id: artifacts.id,
			kind: artifacts.kind,
			title: artifacts.title,
			status: artifacts.status,
			version: artifacts.currentVersion,
			updatedAt: artifacts.updatedAt,
			conversationId: conversations.id,
			conversationTitle: conversations.title,
			stepTitle: steps.title,
			stepPosition: steps.position,
			content: artifactVersions.content,
			data: artifactVersions.data
		})
		.from(artifacts)
		.innerJoin(conversations, eq(conversations.id, artifacts.conversationId))
		.innerJoin(
			artifactVersions,
			and(
				eq(artifactVersions.artifactId, artifacts.id),
				eq(artifactVersions.version, artifacts.currentVersion)
			)
		)
		.leftJoin(steps, eq(steps.id, artifacts.stepId))
		.where(
			and(
				kind ? eq(artifacts.kind, kind) : undefined,
				query
					? or(
							like(artifacts.title, pattern),
							like(artifactVersions.content, pattern),
							like(artifactVersions.data, pattern),
							like(conversations.title, pattern)
						)
					: undefined
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(200);
	return rows.map(({ content, data, ...r }) => ({
		...r,
		snippet: snippet(r.kind, content, data, query)
	}));
}

function snippet(
	kind: ArtifactKind,
	content: string,
	data: Record<string, unknown> | null,
	query: string
) {
	const text =
		kind === 'form'
			? Object.entries(data ?? {})
					.filter(([, v]) => v !== '' && v !== null && v !== undefined)
					.map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
					.join(' · ')
			: kind === 'html'
				? content.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
				: content.replace(/[#*_`>|]/g, '');
	const flat = text.replace(/\s+/g, ' ').trim();
	const at = query ? flat.toLowerCase().indexOf(query.toLowerCase()) : -1;
	const start = Math.max(0, at - 60);
	return (
		(start > 0 ? '…' : '') + flat.slice(start, start + 180) + (flat.length > start + 180 ? '…' : '')
	);
}

/** Answering the last open form in an active step completes that step (forms are how steps gather input). */
export async function completeStepIfAnswered(stepId: string | null) {
	if (!stepId) return;
	const [step] = await db.select().from(steps).where(eq(steps.id, stepId));
	if (step?.status !== 'active') return;
	const open = await db
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(and(eq(artifacts.stepId, stepId), eq(artifacts.status, 'awaiting_input')));
	if (!open.length)
		await db
			.update(steps)
			.set({ status: 'done', summary: step.summary ?? 'Input collected' })
			.where(eq(steps.id, stepId));
}
