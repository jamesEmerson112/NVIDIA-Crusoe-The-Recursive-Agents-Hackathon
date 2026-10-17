import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { FURNITURE_MODELS, modelKey } from './furniture.ts';
import { validatePlan } from '../validate.ts';
import type { Plan } from '../types.ts';

const models = new URL('../../../../static/models/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('catalog.json', models), 'utf8')) as Record<
	string,
	{ dimensions: [number, number, number] }
>;

describe('original furniture delivery', () => {
	it('includes all forty requested pieces', () => expect(Object.keys(catalog)).toHaveLength(40));
	it.each(Object.keys(catalog))(
		'%s is self-contained, correctly sized and within budget',
		(key) => {
			const data = readFileSync(new URL(`${key}.glb`, models));
			expect(data.toString('utf8', 0, 4)).toBe('glTF');
			expect(data.readUInt32LE(4)).toBe(2);
			expect(data.readUInt32LE(8)).toBe(data.length);
			const g = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
			expect(g.scenes[g.scene ?? 0].nodes).toHaveLength(1);
			expect(g.cameras ?? []).toHaveLength(0);
			expect(g.animations ?? []).toHaveLength(0);
			for (const extension of [
				'KHR_draco_mesh_compression',
				'EXT_meshopt_compression',
				'KHR_texture_basisu',
				'KHR_lights_punctual'
			]) {
				expect(g.extensionsUsed ?? []).not.toContain(extension);
			}
			for (const im of g.images ?? []) {
				expect(im.uri).toBeUndefined();
				expect(im.bufferView).toBeTypeOf('number');
			}
			const bounds = new Box3();
			let triangles = 0;
			function visit(index: number, parent: Matrix4) {
				const n = g.nodes[index];
				const matrix = n.matrix
					? new Matrix4().fromArray(n.matrix)
					: new Matrix4().compose(
							new Vector3().fromArray(n.translation ?? [0, 0, 0]),
							new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
							new Vector3().fromArray(n.scale ?? [1, 1, 1])
						);
				matrix.premultiply(parent);
				if (n.mesh !== undefined)
					for (const primitive of g.meshes[n.mesh].primitives) {
						const pos = g.accessors[primitive.attributes.POSITION];
						bounds.union(
							new Box3(
								new Vector3().fromArray(pos.min),
								new Vector3().fromArray(pos.max)
							).applyMatrix4(matrix)
						);
						triangles += g.accessors[primitive.indices].count / 3;
					}
				for (const child of n.children ?? []) visit(child, matrix);
			}
			for (const node of g.scenes[g.scene ?? 0].nodes) visit(node, new Matrix4());
			const [w, d, h] = catalog[key].dimensions;
			const size = bounds.getSize(new Vector3());
			expect(size.x).toBeCloseTo(w, 4);
			expect(size.y).toBeCloseTo(h, 4);
			expect(size.z).toBeCloseTo(d, 4);
			expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0, 4);
			expect((bounds.min.z + bounds.max.z) / 2).toBeCloseTo(0, 4);
			expect(key === 'pendant-lamp' ? bounds.max.y : bounds.min.y).toBeCloseTo(0, 4);
			const hero = /^(bed|sofa|table|floor-lamp|pendant-lamp)/.test(key);
			expect(triangles).toBeLessThanOrEqual(hero ? 50_000 : 15_000);
			expect(data.length).toBeLessThanOrEqual(hero ? 3_000_000 : 1_000_000);
			expect(FURNITURE_MODELS[key]).toBe(`/models/${key}.glb`);
		}
	);

	it.each(['models-p1', 'models-living', 'models-kitchen', 'models-bedroom-bath'])(
		'%s contains valid, registered catalog items',
		(id) => {
			const plan = JSON.parse(
				readFileSync(new URL(`../../../../static/plans/${id}.json`, import.meta.url), 'utf8')
			) as Plan;
			expect(validatePlan(plan)).toEqual([]);
			for (const f of plan.stories[0].furniture) expect(FURNITURE_MODELS[modelKey(f)]).toBeTruthy();
		}
	);
});
