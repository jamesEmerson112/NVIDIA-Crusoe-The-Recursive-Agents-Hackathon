import { error, json } from '@sveltejs/kit';
import { editQuestions } from '#lib/server/agent/edits.ts';

/**
 * Replace the questions of a form that is still waiting for answers. No agent run: nothing
 * depends on an unanswered form, and the agent sees the final questions when it is submitted.
 * Answered forms are edited through POST /run with `artifact_edit` and `spec`.
 */
export async function PUT({ params, request }) {
	const body = await request.json().catch(() => null);
	if (!body?.spec || typeof body.spec !== 'object') error(400, 'spec is required');
	try {
		return json(await editQuestions(params.id, params.artifactId, body.spec));
	} catch (err) {
		const message = (err as Error).message;
		error(
			message.startsWith('Unknown') ? 404 : message.startsWith('Form already answered') ? 409 : 400,
			message
		);
	}
}
