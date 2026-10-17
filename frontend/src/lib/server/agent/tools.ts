import type { ToolSchema, Usage } from '../crusoe';
import type { MessageMeta, StepStatus, WidgetSpec } from '#lib/types.ts';
import * as store from '../store';
import { runQuickEdit } from './subagent';
import { normalizeFormSpec } from '#lib/forms.ts';
import { normalizeWidget } from '#lib/widgets.ts';

export interface ToolContext {
	conversationId: string;
	model: string;
	/** This call's share of the model turn that requested it, attributed to artifacts it creates. */
	usage: Usage;
	signal?: AbortSignal;
	emit: (event: import('#lib/types.ts').RunEvent) => void;
	/**
	 * Artifacts this run is working from: the form submitted or artifact edited to start it, plus
	 * anything read_artifact returned. Used as lineage when a model forgets depends_on.
	 */
	sources: Set<string>;
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
				'Show the user a compact form, inline in the chat, to collect structured input. The answers come back as a [Form submitted] message. Every answer is free text: combine related values into one field (amount with currency, a range, a date with its flexibility, yes/no with details) and put a concrete example in each placeholder.',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					step: { type: 'integer', description: 'Step number this form belongs to.' },
					description: {
						type: 'string',
						description:
							'Usually omit. One short line only if it tells the user something the questions do not. Never say that questions are optional.'
					},
					fields: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string', description: 'snake_case key' },
								label: { type: 'string' },
								type: {
									type: 'string',
									enum: ['text', 'textarea'],
									description: 'Every answer is free text. textarea for longer answers.'
								},
								options: {
									type: 'array',
									items: { type: 'string' },
									description:
										'Suggested answers, shown as one-click chips. The user can always type something else (e.g. "not sure").'
								},
								placeholder: { type: 'string' },
								help: {
									type: 'string',
									description:
										'Rarely needed; only when the question is ambiguous. Prefer placeholder examples.'
								},
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
			name: 'create_widget',
			description: `Show the user an interactive widget inline in the chat, for input a plain form can't capture well: sliders with live totals, ranking, picking on a grid or calendar, splitting a budget, choosing between visual options. Use create_form for ordinary questions.
The html is a fragment (no <html>/<head>) using petite-vue (Vue-like syntax: v-scope, v-model, v-model.number, v-for, v-if, @click, :class, {{ }}). It runs in a sandboxed iframe with no network, so inline any CSS; plain elements are already styled to match the app.
Available in every expression: $submit(obj) sends obj (a JSON object) back to you as a [Widget submitted] message, and $initial is the last submitted object or null. Seed state from it so the widget reopens with the user's answer, e.g. <div v-scope="{ guests: $initial?.guests ?? 8 }">. Exactly one button should call $submit; give it class="primary". Helper classes: row, grid, card, muted, selected.
Computed values: put getters in v-scope, e.g. v-scope="{ items: [...], get total() { return this.items.reduce((s, i) => s + i.amount, 0) } }", then use {{ total }}. Bare names that are not in a v-scope are undefined.
To fix a widget before the user answers it, call update_artifact with its id and the full new html as content; never create a second copy.`,
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					step: { type: 'integer', description: 'Step number this widget belongs to.' },
					html: {
						type: 'string',
						description: 'petite-vue HTML fragment that calls $submit(obj).'
					},
					description: { type: 'string', description: 'One line shown above the widget.' },
					data_schema: {
						type: 'object',
						description:
							'Optional JSON Schema subset for the submitted object (type, properties, required, enum, items, minimum, maximum). Submissions that fail it are rejected.'
					},
					depends_on: dependsOn
				},
				required: ['title', 'html']
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
					content: {
						type: 'string',
						description: 'Markdown for document, a full HTML page for html.'
					},
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
			description:
				'Replace the content of an artifact with a new version you wrote. Use this (not create_artifact) to redo an existing artifact, so its history and lineage are kept.',
			parameters: {
				type: 'object',
				properties: {
					artifact_id: { type: 'string' },
					content: { type: 'string' },
					note: { type: 'string', description: 'What changed, in a few words.' },
					title: { type: 'string', description: 'New title, only if the old one no longer fits.' }
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
				'Delegate a small revision of one artifact to a fast, cheap sub-agent. It sees the artifact and its upstream inputs. Consecutive quick_edit calls in one turn run in parallel.',
			parameters: {
				type: 'object',
				properties: {
					artifact_id: { type: 'string' },
					instruction: { type: 'string', description: 'Exactly what to change and why.' },
					title: { type: 'string', description: 'New title, only if the old one no longer fits.' }
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
	},
	{
		type: 'function',
		function: {
			name: 'propose_redo',
			description:
				'Ask the user to approve an expensive redo before doing it. Shows a card with what would be redone and a cost and time estimate, with Approve and Keep buttons. The answer comes back as an [Approved] or [Declined] message.',
			parameters: {
				type: 'object',
				properties: {
					artifact_ids: {
						type: 'array',
						items: { type: 'string' },
						description: 'Artifacts that would be redone.'
					},
					summary: { type: 'string', description: 'One sentence: why a redo is needed.' },
					plan: { type: 'string', description: 'What exactly would be redone, briefly.' },
					extra_cost_usd: {
						type: 'number',
						description:
							'Optional cost of work beyond regenerating these artifacts (e.g. new research).'
					},
					extra_seconds: { type: 'number', description: 'Optional time for that extra work.' }
				},
				required: ['artifact_ids', 'summary', 'plan']
			}
		}
	}
];

const ok = (data: Record<string, unknown>) => JSON.stringify({ ok: true, ...data });
const fail = (error: string) => JSON.stringify({ ok: false, error });

/**
 * Run one tool call. Never throws: a bad call becomes an error result the model can read and
 * correct, so one malformed argument can't end an unattended run.
 */
export async function runTool(
	name: string,
	rawArgs: string,
	ctx: ToolContext & { callId: string }
): Promise<ToolOutput> {
	let args: Record<string, any>;
	try {
		args = coerceArgs(rawArgs.trim() ? JSON.parse(rawArgs) : {});
	} catch {
		return { content: fail(`Arguments were not valid JSON: ${rawArgs.slice(0, 200)}`) };
	}
	try {
		return await execute(name, args, ctx);
	} catch (err) {
		if (ctx.signal?.aborted) throw err;
		const message = (err as Error).message;
		ctx.emit({ type: 'tool', name, summary: `${name} failed: ${message.slice(0, 80)}` });
		return {
			content: fail(
				`${name} failed: ${message}. Check the arguments against the schema and try again.`
			)
		};
	}
}

/** Models sometimes send arrays or objects as JSON-encoded strings ("[{...}]"); decode those. */
export function coerceArgs(args: unknown): Record<string, any> {
	if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
	return Object.fromEntries(
		Object.entries(args).map(([k, v]) => {
			if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
				try {
					return [k, JSON.parse(v)];
				} catch {
					// Not JSON after all; keep the string.
				}
			}
			return [k, v];
		})
	);
}

async function execute(
	name: string,
	args: Record<string, any>,
	ctx: ToolContext & { callId: string }
): Promise<ToolOutput> {
	const { conversationId: cid } = ctx;
	const provenance = {
		author: 'agent' as const,
		model: ctx.model,
		costUsd: ctx.usage.costUsd,
		durationMs: ctx.usage.durationMs
	};

	switch (name) {
		case 'set_plan': {
			const plan = (Array.isArray(args.steps) ? args.steps : []).map((s: any) => ({
				title: String(s.title),
				status: s.status as StepStatus
			}));
			const rows = await store.setPlan(cid, plan);
			ctx.emit({ type: 'tool', name, summary: `Planned ${rows.length} steps` });
			return {
				content: ok({
					steps: rows.map((s) => ({ step: s.position, title: s.title, status: s.status }))
				})
			};
		}
		case 'update_step': {
			const row = await store.updateStep(cid, Number(args.step), {
				status: args.status,
				summary: args.summary
			});
			if (!row) return { content: fail(`No step ${args.step}`) };
			ctx.emit({ type: 'tool', name, summary: `Step ${row.position}: ${row.status}` });
			return { content: ok({ step: row.position, status: row.status }) };
		}
		case 'create_form': {
			const spec = normalizeFormSpec({
				description: args.description,
				fields: args.fields,
				submitLabel: args.submit_label
			});
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
				content: ok({
					artifact_id: id,
					note: 'Form is shown to the user. Wait for their submission.'
				}),
				meta: { kind: 'artifact', artifactId: id },
				awaitUser: true
			};
		}
		case 'create_widget': {
			let spec;
			try {
				spec = normalizeWidget({
					html: args.html,
					description: args.description,
					schema: args.data_schema
				});
			} catch (err) {
				return { content: fail(`Widget rejected: ${(err as Error).message}`) };
			}
			const { id } = await store.createArtifact({
				conversationId: cid,
				kind: 'widget',
				title: String(args.title),
				content: JSON.stringify(spec),
				step: args.step,
				dependsOn: args.depends_on,
				status: 'awaiting_input',
				provenance
			});
			ctx.emit({ type: 'tool', name, summary: `Widget: ${args.title}` });
			return {
				content: ok({
					artifact_id: id,
					note: 'Widget is shown to the user. Wait for their submission.'
				}),
				meta: { kind: 'artifact', artifactId: id },
				awaitUser: true
			};
		}
		case 'create_artifact': {
			if (!['document', 'html'].includes(args.kind))
				return { content: fail('kind must be document or html') };
			const given: string[] = Array.isArray(args.depends_on) ? args.depends_on : [];
			const inferred = !given.length && ctx.sources.size > 0;
			const { id, linked } = await store.createArtifact({
				conversationId: cid,
				kind: args.kind,
				title: String(args.title),
				content: String(args.content ?? ''),
				step: args.step,
				dependsOn: inferred ? [...ctx.sources] : given,
				provenance
			});
			ctx.emit({ type: 'tool', name, summary: `Created ${args.title}` });
			return {
				content: ok({
					artifact_id: id,
					depends_on: linked,
					...(inferred
						? {
								note: 'depends_on was missing, so it was linked to the inputs of this run. Pass depends_on explicitly next time.'
							}
						: {})
				}),
				meta: { kind: 'artifact', artifactId: id }
			};
		}
		case 'update_artifact': {
			const a = await store.getArtifact(cid, args.artifact_id);
			if (!a) return { content: fail(`No artifact ${args.artifact_id}`) };
			// A widget the user hasn't answered yet can be fixed in place (content = new html).
			if (a.kind === 'widget' && a.status === 'awaiting_input') {
				const old = JSON.parse(a.content) as WidgetSpec;
				let spec;
				try {
					spec = normalizeWidget({
						html: args.content,
						description: old.description,
						schema: old.schema
					});
				} catch (err) {
					return { content: fail(`Widget rejected: ${(err as Error).message}`) };
				}
				const title =
					typeof args.title === 'string' && args.title.trim() ? args.title.trim() : undefined;
				if (title && title !== a.title) await store.renameArtifact(a.id, title);
				const { version } = await store.addVersion(
					cid,
					a.id,
					{
						content: JSON.stringify(spec),
						note: String(args.note ?? 'Fixed widget'),
						status: 'awaiting_input'
					},
					provenance
				);
				ctx.emit({ type: 'tool', name, summary: `Fixed widget ${title ?? a.title}` });
				return {
					content: ok({ artifact_id: a.id, version, note: 'The user now sees the fixed widget.' })
				};
			}
			if (a.kind === 'form' || a.kind === 'widget')
				return {
					content: fail(
						`${a.kind === 'form' ? 'Forms' : 'Widgets'} are answered by the user; create a new one to ask again`
					)
				};
			const title =
				typeof args.title === 'string' && args.title.trim() ? args.title.trim() : undefined;
			if (title && title !== a.title) await store.renameArtifact(a.id, title);
			const { version } = await store.addVersion(
				cid,
				a.id,
				{
					content: String(args.content),
					note:
						String(args.note ?? 'Updated') +
						(title && title !== a.title ? ` (renamed from "${a.title}")` : '')
				},
				provenance
			);
			ctx.emit({ type: 'tool', name, summary: `Updated ${title ?? a.title} to v${version}` });
			return {
				content: ok({ artifact_id: a.id, version }),
				meta: { kind: 'artifact', artifactId: a.id }
			};
		}
		case 'read_artifact': {
			const a = await store.getArtifact(cid, args.artifact_id);
			if (!a) return { content: fail(`No artifact ${args.artifact_id}`) };
			ctx.sources.add(a.id);
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
			if (a.kind === 'form' || a.kind === 'widget')
				return {
					content: fail(
						`${a.kind === 'form' ? 'Forms' : 'Widgets'} are answered by the user; create a new one to ask again`
					)
				};
			ctx.emit({ type: 'tool', name, summary: `Sub-agent revising ${a.title}` });
			await store.setArtifactStatus([a.id], 'updating');
			ctx.emit({ type: 'changed' });
			try {
				const title =
					typeof args.title === 'string' && args.title.trim() ? args.title.trim() : undefined;
				const result = await runQuickEdit(cid, a.id, String(args.instruction), ctx.signal, title);
				ctx.emit({
					type: 'tool',
					name,
					summary: `Sub-agent updated ${title ?? a.title} to v${result.version}`
				});
				return {
					content: ok({
						artifact_id: a.id,
						version: result.version,
						cost_usd: Number(result.costUsd.toFixed(5))
					}),
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
		case 'propose_redo': {
			const ids: string[] = args.artifact_ids ?? [];
			const estimate = await store.estimateRedo(cid, ids);
			if (!estimate.items.length) return { content: fail('None of those artifacts exist') };
			const costUsd = estimate.costUsd + Number(args.extra_cost_usd ?? 0);
			const durationMs = estimate.durationMs + 1000 * Number(args.extra_seconds ?? 0);
			ctx.emit({ type: 'tool', name, summary: 'Asked you to approve a redo' });
			return {
				content: ok({
					note: 'The proposal is shown to the user. Wait for [Approved] or [Declined].',
					estimate_usd: Number(costUsd.toFixed(5)),
					estimate_seconds: Math.round(durationMs / 1000)
				}),
				meta: {
					kind: 'proposal',
					callId: ctx.callId,
					artifactIds: estimate.items.map((i) => i.id),
					summary: String(args.summary ?? ''),
					plan: String(args.plan ?? ''),
					costUsd,
					durationMs
				},
				awaitUser: true
			};
		}
		default:
			return { content: fail(`Unknown tool ${name}`) };
	}
}
