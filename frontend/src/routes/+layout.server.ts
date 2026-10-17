import { CRUSOE_AGENT_MODEL } from '$app/env/private';
import { hasApiKey } from '#lib/server/crusoe.ts';
import { listConversations } from '#lib/server/store.ts';

export async function load({ depends }) {
	depends('app:conversations');
	return {
		conversations: await listConversations(),
		mock: !hasApiKey(),
		model: hasApiKey() ? CRUSOE_AGENT_MODEL : null
	};
}
