import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
	ArtifactKind,
	ArtifactStatus,
	MessageMeta,
	StepStatus,
	ToolCall
} from '#lib/types.ts';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

export const conversations = sqliteTable('conversations', {
	id: id(),
	title: text('title').notNull().default('New conversation'),
	createdAt: createdAt(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/**
 * The agent's message history, stored in OpenAI chat format so it replays byte-identically
 * (prefix caching). `meta` is UI-only and never sent to the model.
 */
export const messages = sqliteTable(
	'messages',
	{
		id: id(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		seq: integer('seq').notNull(),
		role: text('role').$type<'user' | 'assistant' | 'tool'>().notNull(),
		content: text('content'),
		toolCalls: text('tool_calls', { mode: 'json' }).$type<ToolCall[]>(),
		toolCallId: text('tool_call_id'),
		meta: text('meta', { mode: 'json' }).$type<MessageMeta>(),
		createdAt: createdAt()
	},
	(t) => [index('messages_conversation_seq').on(t.conversationId, t.seq)]
);

/** The process: an ordered plan of steps the agent maintains alongside the chat. */
export const steps = sqliteTable(
	'steps',
	{
		id: id(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		title: text('title').notNull(),
		status: text('status').$type<StepStatus>().notNull().default('pending'),
		summary: text('summary'),
		createdAt: createdAt()
	},
	(t) => [index('steps_conversation').on(t.conversationId, t.position)]
);

export const artifacts = sqliteTable(
	'artifacts',
	{
		id: id(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		stepId: text('step_id').references(() => steps.id, { onDelete: 'set null' }),
		kind: text('kind').$type<ArtifactKind>().notNull(),
		title: text('title').notNull(),
		status: text('status').$type<ArtifactStatus>().notNull().default('ready'),
		currentVersion: integer('current_version').notNull().default(1),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('artifacts_conversation').on(t.conversationId)]
);

/**
 * Every change to an artifact is a new version, so earlier states stay recallable.
 * `content` is the body (form spec JSON, markdown, or HTML); `data` holds form answers.
 * Cost and duration of the work that produced the version feed redo estimates.
 */
export const artifactVersions = sqliteTable(
	'artifact_versions',
	{
		id: id(),
		artifactId: text('artifact_id')
			.notNull()
			.references(() => artifacts.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		content: text('content').notNull(),
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
		note: text('note'),
		author: text('author').$type<'agent' | 'user' | 'subagent'>().notNull(),
		model: text('model'),
		costUsd: real('cost_usd').notNull().default(0),
		durationMs: integer('duration_ms').notNull().default(0),
		createdAt: createdAt()
	},
	(t) => [index('artifact_versions_artifact').on(t.artifactId, t.version)]
);

/** Lineage: `downstreamId` was built from `upstreamId`. Edits upstream mark downstream stale. */
export const artifactDeps = sqliteTable(
	'artifact_deps',
	{
		upstreamId: text('upstream_id')
			.notNull()
			.references(() => artifacts.id, { onDelete: 'cascade' }),
		downstreamId: text('downstream_id')
			.notNull()
			.references(() => artifacts.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.upstreamId, t.downstreamId] })]
);

/** One row per model call, for cost tracking and estimates. */
export const usage = sqliteTable('usage', {
	id: id(),
	conversationId: text('conversation_id')
		.notNull()
		.references(() => conversations.id, { onDelete: 'cascade' }),
	model: text('model').notNull(),
	role: text('role').$type<'agent' | 'subagent'>().notNull(),
	promptTokens: integer('prompt_tokens').notNull(),
	completionTokens: integer('completion_tokens').notNull(),
	cachedTokens: integer('cached_tokens').notNull(),
	costUsd: real('cost_usd').notNull(),
	durationMs: integer('duration_ms').notNull(),
	createdAt: createdAt()
});
