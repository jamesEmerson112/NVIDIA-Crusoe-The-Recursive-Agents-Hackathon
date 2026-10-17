import { redirect } from '@sveltejs/kit';
import { listBlueprints } from '#lib/server/store.ts';

// The 3D viewer used to live here; keep old links (?plan=, ?listing=, ?view=, ...) working.
const VIEWER_PARAMS = ['plan', 'listing', 'view', 'debug', 'quality'];

export async function load({ url }) {
	if (VIEWER_PARAMS.some((p) => url.searchParams.has(p))) redirect(307, `/plans/view${url.search}`);
	return { blueprints: await listBlueprints() };
}
