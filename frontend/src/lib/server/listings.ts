// Laurie's synthetic SF listings (formloop/) and their 3D blueprints, served in-app so the viewer and
// the agent don't need the formloop server running. Same generator, seed and count as formloop
// (research/eval_config.yaml: seed 42, listings.count 300), so ids like syn_000 match its /api/plan.
import { generateListings } from '../../../../formloop/src/listings.ts';
import { listingPlan } from '../../../../formloop/src/plan3d.ts';
import type { Listing } from '../../../../formloop/src/types.ts';
import type { Plan } from '#lib/floorplan/types.ts';

export type { Listing };

const SEED = 42;
const COUNT = 300;

let cached: Listing[] | undefined;

export function allListings(): Listing[] {
	return (cached ??= generateListings(COUNT, SEED));
}

export function getListing(id: string): Listing | undefined {
	return allListings().find((l) => l.id === id);
}

export function planForListing(id: string): Plan | undefined {
	const listing = getListing(id);
	return listing && listingPlan(listing);
}
