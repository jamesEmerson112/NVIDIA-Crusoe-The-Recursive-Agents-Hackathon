import { error } from '@sveltejs/kit';
import { isRunning } from '#lib/server/agent/run.ts';
import { conversationState } from '#lib/server/store.ts';

export async function load({ params, depends }) {
	depends('app:conversation');
	const state = await conversationState(params.id);
	if (!state) error(404, 'Conversation not found');
	return { state, running: isRunning(params.id) };
}
