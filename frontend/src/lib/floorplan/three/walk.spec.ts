import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Opening, Plan, Wall } from '../types.ts';
import { move, RADIUS, startPose, wallSegments } from './walk.ts';

const load = (id: string): Plan =>
	JSON.parse(readFileSync(new URL(`../../../../static/plans/${id}.json`, import.meta.url), 'utf8'));

// One 4 m wall along plan x at y = 0, 0.1 m thick, with a 0.9 m door centred at x = 2.
const wall: Wall = { id: 'w', a: [0, 0], b: [4, 0], t: 0.1, exterior: false, party: false };
const door: Opening = { id: 'd', wallId: 'w', pos: 0.5, w: 0.9, h: 2.1, sill: 0, kind: 'door' };
const window_: Opening = { ...door, id: 'win', kind: 'window', sill: 0.9 };
const clearance = RADIUS + wall.t / 2;

describe('wallSegments', () => {
	it('carves door openings out of their wall but not windows', () => {
		expect(wallSegments({ walls: [wall], openings: [door] })).toHaveLength(2);
		expect(wallSegments({ walls: [wall], openings: [window_] })).toHaveLength(1);
	});
});

describe('move', () => {
	it('is blocked by a wall', () => {
		const segs = wallSegments({ walls: [wall], openings: [] });
		const [x, y] = move([1, 1], [0, -2], segs);
		expect(x).toBeCloseTo(1);
		expect(y).toBeCloseTo(clearance);
	});

	it('passes through a door gap', () => {
		const segs = wallSegments({ walls: [wall], openings: [door] });
		const [x, y] = move([2, 1], [0, -2], segs);
		expect(x).toBeCloseTo(2);
		expect(y).toBeCloseTo(-1);
	});

	it('is blocked beside the door gap', () => {
		const segs = wallSegments({ walls: [wall], openings: [door] });
		expect(move([0.8, 1], [0, -2], segs)[1]).toBeCloseTo(clearance);
	});

	it('slides along a wall when moving diagonally into it', () => {
		const segs = wallSegments({ walls: [wall], openings: [] });
		const [x, y] = move([1, 0.5], [1, -1], segs);
		expect(x).toBeCloseTo(2);
		expect(y).toBeCloseTo(clearance);
	});

	it('does not tunnel through a wall on a long step', () => {
		const segs = wallSegments({ walls: [wall], openings: [] });
		expect(move([1, 0.4], [0, -5], segs)[1]).toBeGreaterThan(0);
	});
});

describe('startPose', () => {
	it.each(['sf-studio', 'sf-1br', 'sf-2br', 'sample-1br'])(
		'%s starts clear of every wall',
		(id) => {
			const story = load(id).stories[0];
			const segs = wallSegments(story);
			const { pos, dir } = startPose(story, segs);
			expect(move(pos, [0, 0], segs)).toEqual(pos);
			expect(Math.hypot(...dir)).toBeCloseTo(1);
		}
	);
});
