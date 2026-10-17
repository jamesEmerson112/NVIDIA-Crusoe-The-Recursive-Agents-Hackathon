import { error } from '@sveltejs/kit';
import { editArtifact, replyToProposal, submitForm } from '#lib/server/agent/edits.ts';
import { isRunning, runAgent } from '#lib/server/agent/run.ts';
import { getConversation } from '#lib/server/store.ts';
import type { MessageMeta, RunEvent } from '#lib/types.ts';

type Body =
	| { type: 'message'; content: string }
	| { type: 'form_submit'; artifactId: string; values: Record<string, unknown> }
	| {
			type: 'artifact_edit';
			artifactId: string;
			values?: Record<string, unknown>;
			content?: string;
	  }
	| { type: 'proposal_reply'; callId: string; approved: boolean };

/** Start an agent run and stream its events as newline-delimited JSON. */
export async function POST({ params, request }) {
	const cid = params.id;
	if (!(await getConversation(cid))) error(404, 'Not found');
	if (isRunning(cid)) error(409, 'The agent is already working in this conversation');

	const body = (await request.json()) as Body;
	let input: { content: string; meta?: MessageMeta };
	try {
		if (body.type === 'message') {
			if (!body.content?.trim()) error(400, 'Empty message');
			input = { content: body.content.trim() };
		} else if (body.type === 'form_submit') {
			input = await submitForm(cid, body.artifactId, body.values);
		} else if (body.type === 'proposal_reply') {
			input = await replyToProposal(cid, body.callId, body.approved);
		} else {
			input = await editArtifact(cid, body.artifactId, body);
		}
	} catch (err) {
		if ((err as { status?: number }).status) throw err;
		error(400, (err as Error).message);
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const emit = (e: RunEvent) => {
				try {
					controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
				} catch {
					// Browser went away; the run keeps going and is saved.
				}
			};
			await runAgent(cid, input, emit);
			try {
				controller.close();
			} catch {
				// already closed
			}
		}
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' }
	});
}
