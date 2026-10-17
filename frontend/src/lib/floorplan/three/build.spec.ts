import { readFileSync } from 'node:fs';
import { Mesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { Plan } from '../types.ts';
import { buildPlan, disposeBuild } from './build.ts';

const load = (id: string): Plan =>
	JSON.parse(readFileSync(new URL(`../../../../static/plans/${id}.json`, import.meta.url), 'utf8'));

describe('buildPlan', () => {
	it.each(['sf-studio', 'sf-1br', 'sf-2br'])('%s builds one merged mesh per surface', (id) => {
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
	});

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
