// Real furniture models for the blueprint viewer. Each plan `Furniture` entry is a box (centre x/y,
// size w/d/h, ccw rot in degrees); we load an original or CC0 glTF per type (see CREDITS.md),
// clone it per item and fit it into that box. Types without a model are reported in `missing`
// so the caller keeps its coloured box for them.
//
// Facing convention: after the per-model `frontYaw` correction every model faces three +Z, which
// is plan south (-y) at rot = 0. The plans encode orientation in w/d (rot is almost always 0), so
// the model is also turned in 90° steps to line its long side up with the box's long side, and,
// when the item's room polygon is known, to face the room centre (back against the wall).
import {
	Box3,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Material,
	type Object3D,
	type Texture,
	Vector3
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Furniture, Point, Room } from '../types.ts';

interface ModelSpec {
	url: string;
	/** Yaw (radians) that turns the model so its front faces +Z. */
	frontYaw?: number;
	/** Max ratio between the largest and smallest axis scale; 1 = uniform, Infinity = fill the box. */
	stretch?: number;
	/** Height does not limit the uniform scale (bed headboards poke above the mattress height); capped at 2× h. */
	ignoreHeight?: boolean;
	/** Repeat the model along the box's long side (kitchen cabinet runs). */
	tile?: boolean;
	/** h is the bottom/top mounting elevation, not the object's physical height. */
	mount?: 'bottom' | 'top';
}

const SPECS: Record<string, ModelSpec> = {
	bed: { url: '/models/bed.glb', ignoreHeight: true },
	'bed-single': { url: '/models/bed-single.glb', ignoreHeight: true },
	// Keep the CC0 leather original available explicitly; generic sofas use Japandi linen.
	sofa: { url: '/models/sofa-fabric.glb' },
	'sofa-leather': { url: '/models/sofa.glb' },
	'sofa-fabric': { url: '/models/sofa-fabric.glb' },
	table: { url: '/models/table.glb' },
	'table-coffee': { url: '/models/table-coffee.glb' },
	counter: { url: '/models/counter.glb', tile: true, stretch: Infinity },
	fridge: { url: '/models/fridge.glb' },
	tub: { url: '/models/tub.glb' },
	toilet: { url: '/models/toilet.glb' },
	sink: { url: '/models/sink.glb' },
	washer: { url: '/models/washer.glb' },
	wardrobe: { url: '/models/wardrobe.glb' },
	armchair: { url: '/models/armchair.glb' },
	'tv-console': { url: '/models/tv-console.glb' },
	tv: { url: '/models/tv.glb' },
	rug: { url: '/models/rug.glb' },
	'floor-lamp': { url: '/models/floor-lamp.glb' },
	'side-table': { url: '/models/side-table.glb' },
	bookshelf: { url: '/models/bookshelf.glb' },
	pouf: { url: '/models/pouf.glb' },
	'plant-large': { url: '/models/plant-large.glb' },
	'plant-small': { url: '/models/plant-small.glb' },
	'wall-art': { url: '/models/wall-art.glb', mount: 'bottom' },
	'dining-chair': { url: '/models/dining-chair.glb' },
	'pendant-lamp': { url: '/models/pendant-lamp.glb', mount: 'top' },
	range: { url: '/models/range.glb' },
	'range-hood': { url: '/models/range-hood.glb', mount: 'bottom' },
	dishwasher: { url: '/models/dishwasher.glb' },
	'wall-cabinet': { url: '/models/wall-cabinet.glb', mount: 'bottom' },
	'bar-stool': { url: '/models/bar-stool.glb' },
	island: { url: '/models/island.glb' },
	nightstand: { url: '/models/nightstand.glb' },
	dresser: { url: '/models/dresser.glb' },
	desk: { url: '/models/desk.glb' },
	'desk-chair': { url: '/models/desk-chair.glb' },
	'table-lamp': { url: '/models/table-lamp.glb' },
	shower: { url: '/models/shower.glb' },
	mirror: { url: '/models/mirror.glb', mount: 'bottom' },
	'towel-rail': { url: '/models/towel-rail.glb', mount: 'bottom' },
	dryer: { url: '/models/dryer.glb' }
};

const DEFAULT_STRETCH = 1.5;

/** Furniture type → model URL. `table-coffee` is used for tables lower than 0.6 m. */
export const FURNITURE_MODELS: Partial<Record<string, string>> = Object.fromEntries(
	Object.entries(SPECS).map(([k, v]) => [k, v.url])
);

/** Which model key an item uses (tables split into dining and coffee by height). */
export function modelKey(
	item: Pick<Furniture, 'type' | 'h'> & Partial<Pick<Furniture, 'w' | 'd'>>
): string {
	if (item.type === 'table' && item.h < 0.6) return 'table-coffee';
	if (item.type === 'sofa') return 'sofa-fabric';
	if (item.type === 'bed' && Math.min(item.w ?? Infinity, item.d ?? Infinity) < 1.2)
		return 'bed-single';
	return item.type;
}

export interface BoxLike {
	min: { x: number; y: number; z: number };
	max: { x: number; y: number; z: number };
}

export interface FitOptions {
	frontYaw?: number;
	stretch?: number;
	ignoreHeight?: boolean;
	/** Direction the front should face, in plan coordinates (e.g. towards the room centre). */
	facing?: Point;
	/** Floor height of the story. */
	elevation?: number;
	/** Item-local axis of the run this piece was tiled from ('x' = along w, 'z' = along d). */
	runAxis?: 'x' | 'z';
	/** Treat h as a mounting elevation, retaining height from footprint scale. */
	mount?: 'bottom' | 'top';
}

export interface FitResult {
	/** World position of the model's bottom centre (three coordinates). */
	position: [number, number, number];
	/** Total yaw about Y in radians (item rot + 90° turns + model front correction). */
	rotationY: number;
	/** Scale in the model's own axes. */
	scale: [number, number, number];
	/** Translate the raw model by this first so its footprint centre/bottom sits at the origin. */
	offset: [number, number, number];
}

const ELONGATED = 1.2;

/**
 * Pure fitting math: where and how to place a model with bounding box `box` so it fills the item's
 * box. Prefers a uniform scale (the smallest of the per-axis fits), then lets each axis grow towards
 * its own fit by at most `stretch` times that uniform scale.
 */
export function fitTransform(
	box: BoxLike,
	item: Pick<Furniture, 'x' | 'y' | 'w' | 'd' | 'h' | 'rot'> & Pick<Furniture, 'base'>,
	opts: FitOptions = {}
): FitResult {
	const frontYaw = opts.frontYaw ?? 0;
	const stretch = opts.stretch ?? DEFAULT_STRETCH;
	const sizeX = Math.max(box.max.x - box.min.x, 1e-6);
	const sizeY = Math.max(box.max.y - box.min.y, 1e-6);
	const sizeZ = Math.max(box.max.z - box.min.z, 1e-6);
	// Model footprint after the front correction (a quarter-turn correction swaps the axes).
	const frontQuarter = Math.round(frontYaw / (Math.PI / 2));
	const swapFront = Math.abs(frontQuarter) % 2 === 1;
	const mx = swapFront ? sizeZ : sizeX;
	const mz = swapFront ? sizeX : sizeZ;

	const rot = (item.rot * Math.PI) / 180;
	const modelLong = mx / mz >= ELONGATED ? 'x' : mz / mx >= ELONGATED ? 'z' : null;
	const boxLong = item.w / item.d >= ELONGATED ? 'x' : item.d / item.w >= ELONGATED ? 'z' : null;
	let turns = [0, 1, 2, 3];
	if (modelLong && boxLong) turns = modelLong === boxLong ? [0, 2] : [1, 3];
	// A tile of a longer run keeps its back along the run (front perpendicular to it).
	if (opts.runAxis) turns = opts.runAxis === 'x' ? [0, 2] : [1, 3];

	// Desired front in item-local three coordinates: plan (dx, dy) → three (dx, -dy), undo rot.
	let want: [number, number] = [0, 1];
	if (opts.facing && Math.hypot(opts.facing[0], opts.facing[1]) > 1e-6) {
		const fx = opts.facing[0];
		const fz = -opts.facing[1];
		// three yaw θ maps local (x, z) to (x cosθ + z sinθ, -x sinθ + z cosθ); invert it.
		want = [fx * Math.cos(rot) - fz * Math.sin(rot), fx * Math.sin(rot) + fz * Math.cos(rot)];
	}
	let best = turns[0];
	let bestDot = -Infinity;
	for (const k of turns) {
		const a = (k * Math.PI) / 2;
		const dot = Math.sin(a) * want[0] + Math.cos(a) * want[1];
		if (dot > bestDot + 1e-9) {
			bestDot = dot;
			best = k;
		}
	}

	const odd = best % 2 === 1;
	const fx = odd ? mz : mx;
	const fz = odd ? mx : mz;
	const tx = item.w / fx;
	const tz = item.d / fz;
	const ty = opts.mount ? Infinity : item.h / sizeY;
	const s = Math.min(tx, tz, opts.ignoreHeight ? Infinity : ty);
	const lx = Math.min(tx, s * stretch);
	const lz = Math.min(tz, s * stretch);
	// ignoreHeight keeps proportions but still caps the model at twice the box height.
	const ly = opts.mount ? s : opts.ignoreHeight ? Math.min(s, ty * 2) : Math.min(ty, s * stretch);
	// Back into the model's own axes: odd total quarter turns swap x and z.
	const swap = odd !== swapFront;
	const scale: [number, number, number] = swap ? [lz, ly, lx] : [lx, ly, lz];

	return {
		position: [
			item.x,
			(opts.elevation ?? 0) +
				(opts.mount ? item.h : (item.base ?? 0)) -
				(opts.mount === 'top' ? sizeY * ly : 0),
			-item.y
		],
		rotationY: rot + (best * Math.PI) / 2 + frontYaw,
		scale,
		offset: [-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2]
	};
}

/** Split a long item (counter run) into roughly `unit`-wide pieces along its long side. */
export function tileItem(item: Furniture, unit: number): Furniture[] {
	const alongX = item.w >= item.d;
	const len = alongX ? item.w : item.d;
	const n = Math.max(1, Math.round(len / Math.max(unit, 1e-3)));
	if (n === 1) return [item];
	const piece = len / n;
	const r = (item.rot * Math.PI) / 180;
	// Local axis in plan coordinates (ccw rotation).
	const ax: Point = alongX ? [Math.cos(r), Math.sin(r)] : [-Math.sin(r), Math.cos(r)];
	return Array.from({ length: n }, (_, i) => {
		const t = (i - (n - 1) / 2) * piece;
		return {
			...item,
			id: `${item.id}#${i}`,
			x: item.x + ax[0] * t,
			y: item.y + ax[1] * t,
			w: alongX ? piece : item.w,
			d: alongX ? item.d : piece
		};
	});
}

function centroid(poly: Point[]): Point {
	let a = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x0, y0] = poly[i];
		const [x1, y1] = poly[(i + 1) % poly.length];
		const c = x0 * y1 - x1 * y0;
		a += c;
		cx += (x0 + x1) * c;
		cy += (y0 + y1) * c;
	}
	if (Math.abs(a) < 1e-9) {
		const n = poly.length || 1;
		return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
	}
	return [cx / (3 * a), cy / (3 * a)];
}

interface Loaded {
	scene: Group;
	box: Box3;
}

const cache = new Map<string, Promise<Loaded>>();
/** Live loadFurniture results using each URL; GPU resources are freed when it drops to 0. */
const refs = new Map<string, number>();
let loader: GLTFLoader | null = null;

/** Kenney models ship KHR_materials_unlit; swap those for lit materials so they take shadows. */
function litMaterial(material: Material): Material {
	const m = material as MeshBasicMaterial;
	if (!m.isMeshBasicMaterial) return material;
	const lit = new MeshStandardMaterial({
		color: m.color,
		map: m.map,
		roughness: 0.75,
		metalness: 0,
		transparent: m.transparent,
		opacity: m.opacity,
		side: m.side
	});
	lit.name = m.name;
	m.dispose();
	return lit;
}

function loadModel(url: string): Promise<Loaded> {
	let p = cache.get(url);
	if (!p) {
		loader ??= new GLTFLoader();
		p = loader.loadAsync(url).then((gltf) => {
			const scene = gltf.scene as unknown as Group;
			scene.traverse((o) => {
				const mesh = o as Mesh;
				if (!mesh.isMesh) return;
				mesh.material = Array.isArray(mesh.material)
					? mesh.material.map(litMaterial)
					: litMaterial(mesh.material);
			});
			scene.updateMatrixWorld(true);
			return { scene, box: new Box3().setFromObject(scene) };
		});
		p.catch(() => cache.delete(url));
		cache.set(url, p);
	}
	return p;
}

function disposeObject(root: Object3D) {
	const textures = new Set<Texture>();
	const materials = new Set<Material>();
	root.traverse((o) => {
		const mesh = o as Mesh;
		if (!mesh.isMesh) return;
		mesh.geometry.dispose();
		for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
			materials.add(m);
	});
	for (const m of materials) {
		for (const v of Object.values(m)) if (v && (v as Texture).isTexture) textures.add(v as Texture);
		m.dispose();
	}
	for (const t of textures) t.dispose();
}

export interface LoadFurnitureOptions {
	/** Room polygons, used to turn each piece to face its room's centre. */
	rooms?: Room[];
	/** Floor height added to every piece. */
	elevation?: number;
}

/**
 * Load, clone and fit models for `items`. Each model URL is fetched once (module-level cache) and
 * cloned per item; clones share geometry/materials with the cached scene, so `dispose()` frees those
 * shared GPU resources (and evicts the cache entry) once no other live result uses the same model.
 */
export async function loadFurniture(
	items: Furniture[],
	opts: LoadFurnitureOptions = {}
): Promise<{ group: Group; missing: string[]; ms: number; dispose(): void }> {
	const t0 = performance.now();
	const group = new Group();
	group.name = 'furniture-models';
	const missing = new Set<string>();
	const centres = new Map<string, Point>();
	for (const r of opts.rooms ?? [])
		if (r.polygon.length >= 3) centres.set(r.id, centroid(r.polygon));

	const keys = new Set(items.map(modelKey));
	const loaded = new Map<string, Loaded>();
	await Promise.all(
		[...keys].map(async (key) => {
			const spec = SPECS[key];
			if (!spec) return;
			try {
				loaded.set(key, await loadModel(spec.url));
			} catch (err) {
				console.warn(`furniture: failed to load ${spec.url}`, err);
			}
		})
	);

	for (const item of items) {
		const key = modelKey(item);
		const spec = SPECS[key];
		const model = loaded.get(key);
		if (!spec || !model) {
			missing.add(item.type);
			continue;
		}
		const c = centres.get(item.room);
		const facing: Point | undefined = c ? [c[0] - item.x, c[1] - item.y] : undefined;
		let pieces = [item];
		if (spec.tile) {
			// Tile by the model's footprint width at the scale its depth/height would give.
			const size = model.box.getSize(new Vector3());
			const depth = Math.min(item.w, item.d);
			const unit = size.x * Math.min(depth / size.z, item.h / size.y);
			pieces = tileItem(item, unit);
		}
		for (const piece of pieces) {
			const fit = fitTransform(model.box, piece, {
				frontYaw: spec.frontYaw,
				stretch: spec.stretch,
				ignoreHeight: spec.ignoreHeight,
				mount: spec.mount,
				facing,
				elevation: opts.elevation,
				runAxis: pieces.length > 1 ? (item.w >= item.d ? 'x' : 'z') : undefined
			});
			const inner = model.scene.clone(true);
			inner.position.set(...fit.offset);
			const scaler = new Group();
			scaler.scale.set(...fit.scale);
			scaler.add(inner);
			const holder = new Group();
			holder.name = `furniture:${piece.id}`;
			holder.userData = { furnitureId: item.id, type: item.type };
			holder.position.set(...fit.position);
			holder.rotation.y = fit.rotationY;
			holder.add(scaler);
			holder.traverse((o) => {
				if ((o as Mesh).isMesh) {
					o.castShadow = true;
					o.receiveShadow = true;
				}
			});
			group.add(holder);
		}
	}

	const usedUrls = [...loaded.keys()].map((k) => SPECS[k].url);
	for (const url of usedUrls) refs.set(url, (refs.get(url) ?? 0) + 1);
	let disposed = false;
	return {
		group,
		missing: [...missing],
		ms: Math.round(performance.now() - t0),
		dispose() {
			if (disposed) return;
			disposed = true;
			group.removeFromParent();
			for (const url of usedUrls) {
				const n = (refs.get(url) ?? 1) - 1;
				if (n > 0) {
					refs.set(url, n);
					continue;
				}
				refs.delete(url);
				const p = cache.get(url);
				cache.delete(url);
				p?.then((m) => disposeObject(m.scene)).catch(() => {});
			}
		}
	};
}
