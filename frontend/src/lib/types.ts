// Types shared by server and browser code.

export type ArtifactKind = 'form' | 'document' | 'html';
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
	| { kind: 'error' };

export type FieldType = 'text' | 'textarea' | 'number' | 'email' | 'date' | 'select' | 'radio' | 'checkbox' | 'checkboxes';

export interface FormField {
	name: string;
	label: string;
	type: FieldType;
	options?: string[];
	required?: boolean;
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
