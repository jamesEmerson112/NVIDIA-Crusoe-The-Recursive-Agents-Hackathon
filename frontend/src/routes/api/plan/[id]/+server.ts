import { error, json } from '@sveltejs/kit';
import { planForListing } from '#lib/server/listings.ts';

/** A listing's 3D blueprint in the Plan format of #lib/floorplan/types.ts. */
export function GET({ params }) {
	const plan = planForListing(params.id);
	if (!plan) error(404, `No listing ${params.id}`);
	return json(plan);
}
