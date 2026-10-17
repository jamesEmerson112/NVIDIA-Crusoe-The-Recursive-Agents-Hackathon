import { describe, expect, it } from 'vitest';
import { FURNITURE_MODELS, fitTransform, modelKey, tileItem } from './furniture.ts';
import type { Furniture } from '../types.ts';

const box = (x: number, y: number, z: number) => ({
	min: { x: -x / 2, y: 0, z: -z / 2 },
	max: { x: x / 2, y, z: z / 2 }
});
const item = (o: Partial<Furniture>): Furniture => ({
	id: 'f',
	type: 'sofa',
	room: 'r',
	x: 0,
	y: 0,
	w: 1,
	d: 1,
	h: 1,
	rot: 0,
	...o
});

describe('fitTransform', () => {
	it('scales uniformly when proportions match and centres on (x, -y)', () => {
		const r = fitTransform(box(2, 1, 1), item({ x: 3, y: 4, w: 1, d: 0.5, h: 0.5 }));
		expect(r.scale).toEqual([0.5, 0.5, 0.5]);
		expect(r.position).toEqual([3, 0, -4]);
		expect(r.rotationY).toBeCloseTo(0);
	});

	it('sits the model on the floor and centres its footprint', () => {
		const r = fitTransform(
			{ min: { x: 0, y: -0.4, z: -1 }, max: { x: 1, y: 0.2, z: 0 } },
			item({}),
			{ elevation: 3 }
		);
		expect(r.offset).toEqual([-0.5, 0.4, 0.5]);
		expect(r.position[1]).toBe(3);
	});

	it('limits non-uniform stretch to the given ratio', () => {
		// Fits: x 2, z 1, y 4 -> uniform 1, x and y may grow to 1.5.
		const r = fitTransform(box(1, 1, 1), item({ w: 2, d: 1, h: 4 }), { stretch: 1.5 });
		expect(r.scale).toEqual([1.5, 1.5, 1]);
	});

	it('fills the box exactly with infinite stretch', () => {
		const r = fitTransform(box(1, 1, 1), item({ w: 2, d: 1, h: 4 }), { stretch: Infinity });
		expect(r.scale).toEqual([2, 4, 1]);
	});

	it('turns a long model 90 degrees to match a box that is long in plan y', () => {
		const r = fitTransform(box(2, 1, 1), item({ w: 0.5, d: 1, h: 0.5 }));
		expect(Math.abs(Math.sin(r.rotationY))).toBeCloseTo(1);
		// Scale stays in the model's own axes: model x (2) maps to box d (1).
		expect(r.scale).toEqual([0.5, 0.5, 0.5]);
	});

	it('faces the requested direction (front is +Z = plan south at yaw 0)', () => {
		const south = fitTransform(box(1, 1, 1), item({}), { facing: [0, -1] });
		expect(south.rotationY).toBeCloseTo(0);
		const north = fitTransform(box(1, 1, 1), item({}), { facing: [0, 1] });
		expect(Math.cos(north.rotationY)).toBeCloseTo(-1);
		const east = fitTransform(box(1, 1, 1), item({}), { facing: [1, 0] });
		expect(Math.sin(east.rotationY)).toBeCloseTo(1);
	});

	it('adds the item rotation and model front correction', () => {
		const r = fitTransform(box(1, 1, 1), item({ rot: 90 }), { frontYaw: Math.PI });
		expect(r.rotationY).toBeCloseTo(Math.PI / 2 + Math.PI);
	});

	it('ignores height for the uniform scale when asked (bed headboards)', () => {
		const r = fitTransform(box(1, 1, 1), item({ w: 2, d: 2, h: 0.5 }), { ignoreHeight: true });
		expect(r.scale).toEqual([2, 1, 2]);
	});
});

describe('runAxis', () => {
	it('keeps a tiled cabinet facing across its run', () => {
		// Run along plan y (local z); room centre is north, but the front must face east or west.
		const r = fitTransform(box(1, 1, 1), item({ w: 0.6, d: 0.55 }), {
			runAxis: 'z',
			facing: [-1, 3]
		});
		expect(Math.sin(r.rotationY)).toBeCloseTo(-1);
	});
});

describe('tileItem', () => {
	it('splits a counter along its long side', () => {
		const parts = tileItem(item({ type: 'counter', x: 1, y: 2, w: 0.6, d: 2.4 }), 0.6);
		expect(parts).toHaveLength(4);
		expect(parts.map((p) => p.d)).toEqual([0.6, 0.6, 0.6, 0.6]);
		expect(parts[0].y).toBeCloseTo(1.1);
		expect(parts[3].y).toBeCloseTo(2.9);
		expect(parts.every((p) => p.x === 1 && p.w === 0.6)).toBe(true);
	});
});

describe('modelKey', () => {
	it('uses the coffee table model for low tables', () => {
		expect(modelKey({ type: 'table', h: 0.45 })).toBe('table-coffee');
		expect(modelKey({ type: 'table', h: 0.75 })).toBe('table');
		expect(FURNITURE_MODELS.bed).toBe('/models/bed.glb');
	});
});
