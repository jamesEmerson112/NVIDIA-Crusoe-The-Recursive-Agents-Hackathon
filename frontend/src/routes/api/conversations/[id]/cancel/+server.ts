import { cancelRun } from '#lib/server/agent/run.ts';

export async function POST({ params }) {
	cancelRun(params.id);
	return new Response(null, { status: 204 });
}
