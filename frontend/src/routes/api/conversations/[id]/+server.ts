import { error } from '@sveltejs/kit';
import { cancelRun } from '#lib/server/agent/run.ts';
import { conversationState, deleteConversation } from '#lib/server/store.ts';
import { json } from '@sveltejs/kit';

export async function GET({ params }) {
	const state = await conversationState(params.id);
	if (!state) error(404, 'Not found');
	return json(state);
}

export async function DELETE({ params }) {
	cancelRun(params.id);
	await deleteConversation(params.id);
	return new Response(null, { status: 204 });
}
