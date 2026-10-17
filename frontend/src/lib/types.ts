// Types shared by server and browser code.

export type ArtifactKind = 'form' | 'widget' | 'document' | 'html' | 'blueprint';
export type ArtifactStatus = 'ready' | 'awaiting_input' | 'stale' | 'updating';
export type StepStatus = 'pending' | 'active' | 'done' | 'stale';

export interface ToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

/** UI-only annotations on stored messages. */
export type MessageMeta =
	| { kind: 'form_submit'; artifactId: string; version: number }
	| { kind: 'artifact_edit'; artifactId: string; version: number; staleIds: string[] }
	| { kind: 'artifact'; artifactId: string }
	| {
			kind: 'proposal';
			callId: string;
			artifactIds: string[];
			summary: string;
			plan: string;
			costUsd: number;
			durationMs: number;
	  }
	| { kind: 'proposal_reply'; callId: string; approved: boolean }
	| { kind: 'check'; problems: string[] }
	| { kind: 'error' };

/**
 * Every answer is free text, so "idk" or "flexible" always fits. `options` are suggestion chips that
 * toggle in a comma-separated answer. Older specs used more types (select, radio, date, …);
 * `normalizeFormSpec` converts them.
 */
export type FieldType = 'text' | 'textarea';

export interface FormField {
	name: string;
	label: string;
	type: FieldType;
	options?: string[];
	placeholder?: string;
	help?: string;
	default?: unknown;
}

export interface FormSpec {
	description?: string;
	fields: FormField[];
	submitLabel?: string;
}

/** Events streamed from an agent run to the browser (newline-delimited JSON). */
export type RunEvent =
	| { type: 'status'; text: string }
	| { type: 'delta'; text: string }
	| { type: 'reasoning'; text: string }
	| { type: 'tool'; name: string; summary: string }
	| { type: 'changed' }
	| { type: 'error'; message: string }
	| { type: 'done' };

/** The subset of JSON Schema that widget data is checked against (see `#lib/widgets.ts`). */
export interface DataSchema {
	type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
	properties?: Record<string, DataSchema>;
	required?: string[];
	items?: DataSchema;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	description?: string;
}

/**
 * An agent-written interactive widget: petite-vue HTML run in a sandboxed iframe. It returns
 * data by calling `$submit(obj)`; `$initial` holds the last submitted data.
 */
export interface WidgetSpec {
	html: string;
	description?: string;
	schema?: DataSchema;
}

/**
 * A staged 3D walkthrough of one (possibly fictional) property, tailored to the conversation.
 * Two views: the photoreal showcase living room (/plans/room) and the unit's floor plan, a bundled
 * layout (static/plans/<plan>.json) that opens in the 3D floor-plan viewer (/plans/view).
 */
export interface BlueprintSpec {
	plan: string;
	/** Fictional street address or listing name. */
	address?: string;
	/** One line on why this place fits the user. */
	summary?: string;
	/** 2-4 short points tied to the user's answers. */
	highlights?: string[];
}
