import { hasApiKey } from '#lib/server/crusoe.ts';
import { listConversations } from '#lib/server/store.ts';

export async function load({ depends }) {
	depends('app:conversations');
	return { conversations: await listConversations(), mock: !hasApiKey() };
}
