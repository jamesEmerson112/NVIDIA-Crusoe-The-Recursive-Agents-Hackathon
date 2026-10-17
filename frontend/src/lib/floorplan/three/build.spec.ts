import { readFileSync } from 'node:fs';
import { Mesh, Texture } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { Plan } from '../types.ts';
import { buildPlan, disposeBuild, type FloorMaps } from './build.ts';

const load = (id: string): Plan =>
	JSON.parse(readFileSync(new URL(`../../../../static/plans/${id}.json`, import.meta.url), 'utf8'));

describe('buildPlan', () => {
	it.each(['sf-studio', 'sf-1br', 'sf-2br', 'sample-1br'])(
		'%s builds one merged mesh per surface',
		(id) => {
			const result = buildPlan(load(id));
			const meshes: Mesh[] = [];
			result.group.traverse((o) => o instanceof Mesh && meshes.push(o));
			expect(meshes.map((m) => m.name).sort()).toEqual(
				['doors', 'floors', 'furniture', 'glass', 'walls'].sort()
			);
			for (const m of meshes) {
				const pos = m.geometry.getAttribute('position').array as Float32Array;
				expect(pos.length).toBeGreaterThan(0);
				expect(pos.every(Number.isFinite)).toBe(true);
			}
			disposeBuild(result);
		}
	);

	it('cuts walls at the given height', () => {
		const top = (cut: number) => {
			const walls = buildPlan(load('sf-1br'), cut).group.getObjectByName('walls') as Mesh;
			walls.geometry.computeBoundingBox();
			return walls.geometry.boundingBox!.max.y;
		};
		expect(top(Infinity)).toBeCloseTo(2.7, 5);
		expect(top(1.2)).toBeCloseTo(1.2, 5);
	});
});

const maps = (): FloorMaps => {
	const set = () => ({ map: new Texture(), normalMap: new Texture(), roughnessMap: new Texture() });
	return { wood: set(), tile: set() };
};

const meshesOf = (result: ReturnType<typeof buildPlan>) => {
	const meshes: Mesh[] = [];
	result.group.traverse((o) => o instanceof Mesh && meshes.push(o));
	return meshes;
};

/** One 4 m wall along plan x with a door at 1.55–2.45 m and a window at 2.8–3.6 m. */
const oneWall = (): Plan => ({
	id: 't',
	name: 't',
	synthetic: true,
	origin: [0, 0],
	stories: [
		{
			level: 0,
			elevation: 0,
			height: 2.7,
			walls: [{ id: 'w', a: [0, 0], b: [4, 0], t: 0.1, exterior: false, party: false }],
			openings: [
				{ id: 'd', wallId: 'w', pos: 0.5, w: 0.9, h: 2.1, sill: 0, kind: 'door' },
				{ id: 'g', wallId: 'w', pos: 0.8, w: 0.8, h: 1.2, sill: 0.9, kind: 'window' }
			],
			rooms: [
				{
					id: 'r',
					name: 'r',
					type: 'living',
					polygon: [
						[0, 0],
						[4, 0],
						[4, 3],
						[0, 3]
					]
				}
			],
			furniture: []
		}
	]
});

describe('buildPlan (realistic)', () => {
	it.each(['sf-studio', 'sf-1br', 'sf-2br', 'sample-1br'])(
		'%s adds frames, baseboards and door slabs with finite positions',
		(id) => {
			const result = buildPlan(load(id), Infinity, maps());
			const names = meshesOf(result).map((m) => m.name);
			expect(names).toEqual(
				expect.arrayContaining([
					'walls',
					'caps',
					'glass',
					'doors',
					'frames',
					'baseboards',
					'ceiling',
					'lights',
					'furniture'
				])
			);
			for (const m of meshesOf(result)) {
				const pos = m.geometry.getAttribute('position').array as Float32Array;
				expect(pos.length).toBeGreaterThan(0);
				expect(pos.every(Number.isFinite)).toBe(true);
			}
			disposeBuild(result);
		}
	);

	it('leaves the ceiling out of cut-away views', () => {
		const result = buildPlan(load('sf-2br'), 1.2, maps());
		expect(result.group.getObjectByName('ceiling')).toBeUndefined();
		expect(result.group.getObjectByName('frames')).toBeDefined();
		expect(result.group.getObjectByName('baseboards')).toBeDefined();
		disposeBuild(result);
	});

	it('runs baseboards under windows but not across doors', () => {
		const result = buildPlan(oneWall(), Infinity, maps());
		const boards = result.group.getObjectByName('baseboards') as Mesh;
		const pos = boards.geometry.getAttribute('position');
		const xs = Array.from({ length: pos.count }, (_, i) => pos.getX(i));
		expect(xs.every((x) => x <= 1.55 + 1e-6 || x >= 2.45 - 1e-6)).toBe(true);
		expect(xs.some((x) => x > 3.6)).toBe(true); // the run past the window reaches the wall end
		expect(Math.max(...Array.from({ length: pos.count }, (_, i) => pos.getY(i)))).toBeCloseTo(
			0.08,
			5
		);
		disposeBuild(result);
	});
});
