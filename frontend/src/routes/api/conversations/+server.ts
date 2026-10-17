import { json } from '@sveltejs/kit';
import { createConversation } from '#lib/server/store.ts';

export async function POST() {
	const conversation = await createConversation();
	return json({ id: conversation.id });
}
