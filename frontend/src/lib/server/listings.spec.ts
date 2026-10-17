import { describe, expect, it } from 'vitest';
import { validatePlan } from '#lib/floorplan/validate.ts';
import { allListings, getListing, planForListing } from './listings.ts';

describe('in-app formloop listings', () => {
	it('matches formloop ids and count', () => {
		expect(allListings()).toHaveLength(300);
		expect(getListing('syn_000')?.neighborhood).toBe('Pacific Heights');
		expect(planForListing('nope')).toBeUndefined();
	});

	it('gives every listing a valid 3D plan', () => {
		for (const l of allListings()) expect(validatePlan(planForListing(l.id)!), l.id).toEqual([]);
	});
});
