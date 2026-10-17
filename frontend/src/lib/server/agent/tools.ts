import type { ToolSchema, Usage } from '../crusoe';
import type { FormSpec, MessageMeta, StepStatus } from '#lib/types.ts';
import * as store from '../store';
import { runQuickEdit } from './subagent';

export interface ToolContext {
	conversationId: string;
	model: string;
	/** This call's share of the model turn that requested it, attributed to artifacts it creates. */
	usage: Usage;
	signal?: AbortSignal;
	emit: (event: import('#lib/types.ts').RunEvent) => void;
}

export interface ToolOutput {
	content: string;
	meta?: MessageMeta;
	/** The agent should stop and wait for the user (a form was shown). */
	awaitUser?: boolean;
}

const stepStatus = { type: 'string', enum: ['pending', 'active', 'done'] };
const dependsOn = {
	type: 'array',
	items: { type: 'string' },
	description: 'Ids of artifacts this one was built from (including forms).'
};

// Order and key order are fixed: the tool block is part of the cached prefix.
export const TOOL_SCHEMAS: ToolSchema[] = [
	{
		type: 'function',
		function: {
			name: 'set_plan',
			description: 'Create or replace the numbered plan of steps for this conversation.',
			parameters: {
				type: 'object',
				properties: {
					steps: {
						type: 'array',
						items: {
							type: 'object',
							properties: { title: { type: 'string' }, status: stepStatus },
							required: ['title']
						}
					}
				},
				required: ['steps']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_step',
			description: 'Update one step of the plan by its number.',
			parameters: {
				type: 'object',
				properties: {
					step: { type: 'integer', description: '1-based step number' },
					status: stepStatus,
					summary: { type: 'string', description: 'One line on what was done or decided.' }
				},
				required: ['step', 'status']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_form',
			description:
				'Show the user a form to collect structured input. The answers come back as a [Form submitted] message.',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					step: { type: 'integer', description: 'Step number this form belongs to.' },
					description: { type: 'string' },
					fields: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string', description: 'snake_case key' },
								label: { type: 'string' },
								type: {
									type: 'string',
									enum: ['text', 'textarea', 'number', 'email', 'date', 'select', 'radio', 'checkbox', 'checkboxes']
								},
								options: { type: 'array', items: { type: 'string' } },
								required: { type: 'boolean' },
								placeholder: { type: 'string' },
								help: { type: 'string' },
								default: {}
							},
							required: ['name', 'label', 'type']
						}
					},
					submit_label: { type: 'string' },
					depends_on: dependsOn
				},
				required: ['title', 'fields']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_artifact',
			description: 'Save a standalone output (document or html) to the process.',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					kind: { type: 'string', enum: ['document', 'html'] },
					step: { type: 'integer', description: 'Step number this artifact belongs to.' },
					content: { type: 'string', description: 'Markdown for document, a full HTML page for html.' },
					depends_on: dependsOn
				},
				required: ['title', 'kind', 'content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_artifact',
			description: 'Replace the content of an artifact with a new version you wrote.',
			parameters: {
				type: 'object',
				properties: {
					artifact_id: { type: 'string' },
					content: { type: 'string' },
					note: { type: 'string', description: 'What changed, in a few words.' }
				},
				required: ['artifact_id', 'content', 'note']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'read_artifact',
			description: 'Read the current content (and form answers) of an artifact.',
			parameters: {
				type: 'object',
				properties: { artifact_id: { type: 'string' } },
				required: ['artifact_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'quick_edit',
			description:
				'Delegate a small revision of one artifact to a fast, cheap sub-agent. It sees the artifact and its upstream inputs. Several quick_edit calls in one turn run in parallel.',
			parameters: {
				type: 'object',
				properties: {
					artifact_id: { type: 'string' },
					instruction: { type: 'string', description: 'Exactly what to change and why.' }
				},
				required: ['artifact_id', 'instruction']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'mark_fresh',
			description: 'Clear the stale flag on artifacts that an upstream edit does not affect.',
			parameters: {
				type: 'object',
				properties: { artifact_ids: { type: 'array', items: { type: 'string' } } },
				required: ['artifact_ids']
			}
		}
	}
];

const ok = (data: Record<string, unknown>) => JSON.stringify({ ok: true, ...data });
const fail = (error: string) => JSON.stringify({ ok: false, error });

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutput> {
	let args: Record<string, any>;
	try {
		args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
	} catch {
		return { content: fail(`Arguments were not valid JSON: ${rawArgs.slice(0, 200)}`) };
	}
	const { conversationId: cid } = ctx;
	const provenance = {
		author: 'agent' as const,
		model: ctx.model,
		costUsd: ctx.usage.costUsd,
		durationMs: ctx.usage.durationMs
	};

	switch (name) {
		case 'set_plan': {
			const plan = (args.steps ?? []).map((s: any) => ({ title: String(s.title), status: s.status as StepStatus }));
			const rows = await store.setPlan(cid, plan);
			ctx.emit({ type: 'tool', name, summary: `Planned ${rows.length} steps` });
			return { content: ok({ steps: rows.map((s) => ({ step: s.position, title: s.title, status: s.status })) }) };
		}
		case 'update_step': {
			const row = await store.updateStep(cid, Number(args.step), { status: args.status, summary: args.summary });
			if (!row) return { content: fail(`No step ${args.step}`) };
			ctx.emit({ type: 'tool', name, summary: `Step ${row.position}: ${row.status}` });
			return { content: ok({ step: row.position, status: row.status }) };
		}
		case 'create_form': {
			const spec: FormSpec = {
				description: args.description,
				fields: args.fields ?? [],
				submitLabel: args.submit_label
			};
			if (!spec.fields.length) return { content: fail('A form needs at least one field') };
			const { id } = await store.createArtifact({
				conversationId: cid,
				kind: 'form',
				title: String(args.title),
				content: JSON.stringify(spec),
				step: args.step,
				dependsOn: args.depends_on,
				status: 'awaiting_input',
				provenance
			});
			ctx.emit({ type: 'tool', name, summary: `Form: ${args.title}` });
			return {
				content: ok({ artifact_id: id, note: 'Form is shown to the user. Wait for their submission.' }),
				meta: { kind: 'artifact', artifactId: id },
				awaitUser: true
			};
		}
		case 'create_artifact': {
			if (!['document', 'html'].includes(args.kind)) return { content: fail('kind must be document or html') };
			const { id, linked } = await store.createArtifact({
				conversationId: cid,
				kind: args.kind,
				title: String(args.title),
				content: String(args.content ?? ''),
				step: args.step,
				dependsOn: args.depends_on,
				provenance
			});
			ctx.emit({ type: 'tool', name, summary: `Created ${args.title}` });
			return { content: ok({ artifact_id: id, depends_on: linked }), meta: { kind: 'artifact', artifactId: id } };
		}
		case 'update_artifact': {
			const a = await store.getArtifact(cid, args.artifact_id);
			if (!a) return { content: fail(`No artifact ${args.artifact_id}`) };
			if (a.kind === 'form') return { content: fail('Forms are edited by the user, not the agent') };
			const { version } = await store.addVersion(
				cid,
				a.id,
				{ content: String(args.content), note: String(args.note ?? 'Updated') },
				provenance
			);
			ctx.emit({ type: 'tool', name, summary: `Updated ${a.title} to v${version}` });
			return { content: ok({ artifact_id: a.id, version }), meta: { kind: 'artifact', artifactId: a.id } };
		}
		case 'read_artifact': {
			const a = await store.getArtifact(cid, args.artifact_id);
			if (!a) return { content: fail(`No artifact ${args.artifact_id}`) };
			return {
				content: ok({
					artifact_id: a.id,
					title: a.title,
					kind: a.kind,
					status: a.status,
					version: a.currentVersion,
					content: a.content,
					answers: a.data ?? undefined
				})
			};
		}
		case 'quick_edit': {
			const a = await store.getArtifact(cid, args.artifact_id);
			if (!a) return { content: fail(`No artifact ${args.artifact_id}`) };
			if (a.kind === 'form') return { content: fail('Forms are edited by the user, not the agent') };
			ctx.emit({ type: 'tool', name, summary: `Sub-agent revising ${a.title}` });
			await store.setArtifactStatus([a.id], 'updating');
			ctx.emit({ type: 'changed' });
			try {
				const result = await runQuickEdit(cid, a.id, String(args.instruction), ctx.signal);
				ctx.emit({ type: 'tool', name, summary: `Sub-agent updated ${a.title} to v${result.version}` });
				return {
					content: ok({ artifact_id: a.id, version: result.version, cost_usd: Number(result.costUsd.toFixed(5)) }),
					meta: { kind: 'artifact', artifactId: a.id }
				};
			} catch (err) {
				await store.setArtifactStatus([a.id], 'stale');
				return { content: fail(`Sub-agent failed: ${(err as Error).message}`) };
			}
		}
		case 'mark_fresh': {
			const ids: string[] = args.artifact_ids ?? [];
			await store.setArtifactStatus(ids, 'ready');
			ctx.emit({ type: 'tool', name, summary: `Marked ${ids.length} artifact(s) up to date` });
			return { content: ok({ artifact_ids: ids }) };
		}
		default:
			return { content: fail(`Unknown tool ${name}`) };
	}
}
