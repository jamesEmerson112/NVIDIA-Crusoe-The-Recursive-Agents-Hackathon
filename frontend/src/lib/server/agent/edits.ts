import * as store from '../store';
import type { MessageMeta } from '#lib/types.ts';

type Input = { content: string; meta: MessageMeta };

const fmt = (v: unknown) => (v === undefined || v === null || v === '' ? '(empty)' : JSON.stringify(v));
const money = (usd: number) => `$${usd.toFixed(usd < 0.01 ? 5 : 3)}`;
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/** First submission of a form the agent is waiting on. A re-submission is an edit. */
export async function submitForm(cid: string, artifactId: string, values: Record<string, unknown>): Promise<Input> {
	const form = await store.getArtifact(cid, artifactId);
	if (!form || form.kind !== 'form') throw new Error('Unknown form');
	if (form.status !== 'awaiting_input') return editArtifact(cid, artifactId, { values });

	const { version } = await store.addVersion(cid, artifactId, { data: values, note: 'Submitted' }, { author: 'user' });
	return {
		content: `[Form submitted] "${form.title}" (${artifactId}) v${version}:\n\`\`\`json\n${JSON.stringify(values, null, 2)}\n\`\`\``,
		meta: { kind: 'form_submit', artifactId, version }
	};
}

/**
 * The user changed an earlier artifact. Save a version, mark everything built from it stale,
 * and describe the change with a redo estimate so the agent can choose patch vs. ask.
 */
export async function editArtifact(
	cid: string,
	artifactId: string,
	edit: { values?: Record<string, unknown>; content?: string }
): Promise<Input> {
	const before = await store.getArtifact(cid, artifactId);
	if (!before) throw new Error('Unknown artifact');

	const changes: string[] = [];
	if (edit.values) {
		const old = before.data ?? {};
		for (const key of new Set([...Object.keys(old), ...Object.keys(edit.values)])) {
			if (JSON.stringify(old[key]) !== JSON.stringify(edit.values[key])) {
				changes.push(`- ${key}: ${fmt(old[key])} → ${fmt(edit.values[key])}`);
			}
		}
	}
	if (edit.content !== undefined && edit.content !== before.content) {
		changes.push(`- content edited directly (${before.content.length} → ${edit.content.length} characters); read_artifact to see it`);
	}
	if (!changes.length) throw new Error('Nothing changed');

	const { version } = await store.addVersion(
		cid,
		artifactId,
		{ data: edit.values, content: edit.content, note: 'Edited by user', status: 'ready' },
		{ author: 'user' }
	);
	const staleIds = await store.downstreamOf(artifactId);
	await store.setArtifactStatus(staleIds, 'stale');
	const estimate = await store.estimateRedo(cid, staleIds);

	const staleLines = estimate.items.map(
		(i) => `- ${i.id} "${i.title}" (${i.kind}): last produced for ${money(i.costUsd)} in ${secs(i.durationMs)}`
	);
	const content = [
		`[Edit] I changed "${before.title}" (${artifactId}) from v${before.currentVersion} to v${version}.`,
		'Changes:',
		...changes,
		staleIds.length ? 'Now stale (built from it):' : 'Nothing is built from it yet.',
		...staleLines,
		...(staleIds.length
			? [`Redo estimate if all are regenerated: ~${money(estimate.costUsd)}, ~${secs(estimate.durationMs)}.`]
			: [])
	].join('\n');

	return { content, meta: { kind: 'artifact_edit', artifactId, version, staleIds } };
}
