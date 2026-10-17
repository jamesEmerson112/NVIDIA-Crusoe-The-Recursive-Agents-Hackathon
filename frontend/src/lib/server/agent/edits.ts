import * as store from '../store';
import { diffSpecs, normalizeFormSpec } from '#lib/forms.ts';
import { checkSubmission, diffData } from '#lib/widgets.ts';
import type { FormSpec, MessageMeta, WidgetSpec } from '#lib/types.ts';

type Input = { content: string; meta: MessageMeta };

const fmt = (v: unknown) =>
	v === undefined || v === null || v === '' ? '(empty)' : JSON.stringify(v);
const money = (usd: number) => `$${usd.toFixed(usd < 0.01 ? 5 : 3)}`;
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/** Answers listed with their question labels, so the agent reads them the way the user saw them. */
function answerLines(spec: FormSpec, values: Record<string, unknown>) {
	return spec.fields.map((f) => `- ${f.label} (${f.name}): ${fmt(values[f.name])}`);
}

const parseSpec = (content: string) => JSON.parse(content) as FormSpec;

/** Keep answers only for questions that still exist. */
const keepAnswers = (spec: FormSpec, values: Record<string, unknown> | null | undefined) =>
	Object.fromEntries(
		spec.fields.filter((f) => values && f.name in values).map((f) => [f.name, values![f.name]])
	);

/** First submission of a form the agent is waiting on. A re-submission is an edit. */
export async function submitForm(
	cid: string,
	artifactId: string,
	values: Record<string, unknown>
): Promise<Input> {
	const form = await store.getArtifact(cid, artifactId);
	if (!form || (form.kind !== 'form' && form.kind !== 'widget')) throw new Error('Unknown form');
	if (form.kind === 'widget') checkWidgetData(form.content, values);
	if (form.status !== 'awaiting_input') return editArtifact(cid, artifactId, { values });
	if (form.kind === 'widget') {
		const { version } = await store.addVersion(
			cid,
			artifactId,
			{ data: values, note: 'Submitted' },
			{ author: 'user' }
		);
		await store.completeStepIfAnswered(form.stepId);
		return {
			content: `[Widget submitted] "${form.title}" (${artifactId}):\n\`\`\`json\n${JSON.stringify(values, null, 2)}\n\`\`\``,
			meta: { kind: 'form_submit', artifactId, version }
		};
	}

	const spec = parseSpec(form.content);
	const answers = keepAnswers(spec, values);
	const { version } = await store.addVersion(
		cid,
		artifactId,
		{ data: answers, note: 'Submitted' },
		{ author: 'user' }
	);
	await store.completeStepIfAnswered(form.stepId);
	const edited = (await store.listVersions(artifactId)).some((v) => v.note === 'Questions edited');
	return {
		content: [
			`[Form submitted] "${form.title}" (${artifactId}) v${version}${edited ? ' (I edited some of your questions before answering; go by these labels)' : ''}:`,
			...answerLines(spec, answers),
			'```json',
			JSON.stringify(answers, null, 2),
			'```'
		].join('\n'),
		meta: { kind: 'form_submit', artifactId, version }
	};
}

/**
 * The user changed the questions of a form that hasn't been answered yet. Nothing depends on it,
 * so this only saves a version; the agent sees the final questions in the submission message.
 */
export async function editQuestions(cid: string, artifactId: string, spec: unknown) {
	const form = await store.getArtifact(cid, artifactId);
	if (!form || form.kind !== 'form') throw new Error('Unknown form');
	if (form.status !== 'awaiting_input')
		throw new Error('Form already answered: edit it with an artifact_edit run');
	const next = normalizeFormSpec(spec as FormSpec);
	if (!next.fields.length) throw new Error('A form needs at least one question');
	if (!diffSpecs(parseSpec(form.content), next).length) throw new Error('Nothing changed');
	const { version } = await store.addVersion(
		cid,
		artifactId,
		{ content: JSON.stringify(next), note: 'Questions edited', status: 'awaiting_input' },
		{ author: 'user' }
	);
	return { version };
}

/**
 * The user changed an earlier artifact. Save a version, mark everything built from it stale,
 * and describe the change with a redo estimate so the agent can choose patch vs. ask.
 * For forms, `spec` replaces the questions and `values` the answers (either may be omitted).
 */
export async function editArtifact(
	cid: string,
	artifactId: string,
	edit: { values?: Record<string, unknown>; content?: string; spec?: unknown }
): Promise<Input> {
	const before = await store.getArtifact(cid, artifactId);
	if (!before) throw new Error('Unknown artifact');

	const changes: string[] = [];
	let content = edit.content;
	let data = edit.values;
	if (before.kind === 'form') {
		const oldSpec = parseSpec(before.content);
		const spec = edit.spec ? normalizeFormSpec(edit.spec as FormSpec) : oldSpec;
		if (!spec.fields.length) throw new Error('A form needs at least one question');
		const questionChanges = diffSpecs(oldSpec, spec);
		if (questionChanges.length) {
			changes.push('Questions:', ...questionChanges);
			content = JSON.stringify(spec);
		} else {
			content = undefined;
		}
		const oldAnswers = before.data ?? {};
		data = keepAnswers(spec, edit.values ?? oldAnswers);
		const label = new Map([...oldSpec.fields, ...spec.fields].map((f) => [f.name, f.label]));
		const answerChanges = [...new Set([...Object.keys(oldAnswers), ...Object.keys(data)])]
			.filter((k) => spec.fields.some((f) => f.name === k))
			.filter((k) => JSON.stringify(oldAnswers[k]) !== JSON.stringify(data![k]))
			.map((k) => `- ${label.get(k) ?? k} (${k}): ${fmt(oldAnswers[k])} → ${fmt(data![k])}`);
		if (answerChanges.length) changes.push('Answers:', ...answerChanges);
		if (questionChanges.length) changes.push('Current answers:', ...answerLines(spec, data));
	} else if (before.kind === 'widget') {
		if (!edit.values) throw new Error('Nothing changed');
		checkWidgetData(before.content, edit.values);
		content = undefined;
		data = edit.values;
		changes.push(...diffData(before.data ?? {}, data));
		if (changes.length)
			changes.push('Submitted data now:', '```json', JSON.stringify(data, null, 2), '```');
	} else if (edit.content !== undefined && edit.content !== before.content) {
		changes.push(
			`- content edited directly (${before.content.length} → ${edit.content.length} characters); read_artifact to see it`
		);
	}
	if (!changes.length) throw new Error('Nothing changed');

	const { version } = await store.addVersion(
		cid,
		artifactId,
		{
			data: before.kind === 'form' || before.kind === 'widget' ? data : undefined,
			content,
			note: changes[0] === 'Questions:' ? 'Questions and answers edited by user' : 'Edited by user',
			status: 'ready'
		},
		{ author: 'user' }
	);
	const staleIds = await store.downstreamOf(artifactId);
	await store.setArtifactStatus(staleIds, 'stale');
	const estimate = await store.estimateRedo(cid, staleIds);

	const staleLines = estimate.items.map(
		(i) =>
			`- ${i.id} "${i.title}" (${i.kind}): last produced for ${money(i.costUsd)} in ${secs(i.durationMs)}`
	);
	const message = [
		`[Edit] I changed "${before.title}" (${artifactId}) from v${before.currentVersion} to v${version}.`,
		'Changes:',
		...changes,
		staleIds.length ? 'Now stale (built from it):' : 'Nothing is built from it yet.',
		...staleLines,
		...(staleIds.length
			? [
					`Redo estimate if all are regenerated: ~${money(estimate.costUsd)}, ~${secs(estimate.durationMs)}.`,
					'',
					'Before calling any other tool, decide whether this is SMALL or LARGE and say which in one short sentence:',
					'- SMALL: the stale artifacts keep their subject and structure; only some values or wording change (a number, a date, a name, tone). Patch them with quick_edit, or mark_fresh the unaffected ones.',
					'- LARGE: the change alters what an artifact is about or invalidates its research or recommendations (e.g. a different cuisine, audience, goal, product or location), or would need a new title. Call propose_redo and stop; do not edit anything until I approve.'
				]
			: [])
	].join('\n');

	return { content: message, meta: { kind: 'artifact_edit', artifactId, version, staleIds } };
}

/** The user answered a propose_redo card. */
export async function replyToProposal(
	cid: string,
	callId: string,
	approved: boolean
): Promise<Input> {
	const rows = await store.listMessages(cid);
	const proposal = rows.find((m) => m.meta?.kind === 'proposal' && m.meta.callId === callId)?.meta;
	if (proposal?.kind !== 'proposal') throw new Error('Unknown proposal');
	if (rows.some((m) => m.meta?.kind === 'proposal_reply' && m.meta.callId === callId)) {
		throw new Error('Already answered');
	}
	const titles = [];
	for (const id of proposal.artifactIds) {
		const a = await store.getArtifact(cid, id);
		titles.push(`"${a?.title ?? id}" (${id})`);
	}
	return {
		content: approved
			? `[Approved] Go ahead and redo ${titles.join(', ')}. Redo each one in place with update_artifact on that id (pass a new title if the old one no longer fits); don't create replacement artifacts.`
			: `[Declined] Keep the current versions of ${titles.join(', ')}; don't redo them.`,
		meta: { kind: 'proposal_reply', callId, approved }
	};
}

function checkWidgetData(content: string, values: unknown) {
	const problems = checkSubmission(JSON.parse(content) as WidgetSpec, values);
	if (problems.length) throw new Error(`The widget sent invalid data: ${problems.join('; ')}`);
}
