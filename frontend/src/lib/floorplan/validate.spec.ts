import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Plan } from './types.ts';
import { area, centroid, contains, floorArea, validatePlan } from './validate.ts';

const load = (id: string): Plan =>
	JSON.parse(readFileSync(new URL(`../../../static/plans/${id}.json`, import.meta.url), 'utf8'));

describe('sample blueprints', () => {
	it.each([
		['sf-studio', 35.84],
		['sf-1br', 55.44],
		['sf-2br', 85.12],
		['sample-1br', 59.03]
	])('%s is valid and %d m²', (id, m2) => {
		const plan = load(id);
		expect(validatePlan(plan)).toEqual([]);
		expect(floorArea(plan)).toBeCloseTo(m2, 2);
	});
});

describe('validatePlan', () => {
	it('flags openings, rooms and furniture that do not fit', () => {
		const plan = load('sf-studio');
		const story = plan.stories[0];
		story.openings.push({
			id: 'too-wide',
			wallId: 's',
			pos: 0.99,
			w: 1,
			h: 1,
			sill: 1,
			kind: 'window'
		});
		story.openings.push({
			id: 'orphan',
			wallId: 'nope',
			pos: 0.5,
			w: 1,
			h: 1,
			sill: 1,
			kind: 'window'
		});
		story.rooms.push({
			id: 'flat',
			name: 'Flat',
			type: 'hall',
			polygon: [
				[0, 0],
				[1, 0],
				[2, 0]
			]
		});
		story.furniture.push({
			id: 'escape',
			type: 'sofa',
			room: 'bath',
			x: 5,
			y: 1,
			w: 1,
			d: 1,
			h: 1,
			rot: 0
		});
		const problems = validatePlan(plan);
		expect(problems).toContain('opening too-wide: extends past the ends of wall s');
		expect(problems).toContain('opening orphan: unknown wall nope');
		expect(problems).toContain('room flat: zero area');
		expect(problems).toContain('furniture escape: not inside room bath');
	});
});

describe('geometry helpers', () => {
	const square: [number, number][] = [
		[0, 0],
		[2, 0],
		[2, 2],
		[0, 2]
	];
	it('computes area and centroid', () => {
		expect(area(square)).toBe(4);
		expect(centroid(square)).toEqual([1, 1]);
	});
	it('counts boundary points as inside', () => {
		expect(contains(square, [2, 1])).toBe(true);
		expect(contains(square, [2.01, 1])).toBe(false);
	});
});
