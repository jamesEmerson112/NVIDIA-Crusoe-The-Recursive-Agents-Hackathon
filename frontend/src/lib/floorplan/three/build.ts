// Plan → three.js meshes. Walls are box segments around openings (no CSG), floors are ShapeGeometry
// tinted per room type, and each surface class is merged into one mesh, so a unit is ~5 draw calls.
// Plan (x, y) maps to three (x, -z) with Y up.
import {
	BoxGeometry,
	BufferGeometry,
	CircleGeometry,
	Color,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	RepeatWrapping,
	Shape,
	ShapeGeometry,
	SRGBColorSpace,
	type Texture,
	Vector2
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Furniture, Opening, Plan, Point, RoomType, Story, Wall } from '../types.ts';

export const ROOM_COLORS: Record<RoomType, string> = {
	living: '#e9d8b4',
	bedroom: '#c9d7ee',
	kitchen: '#f2c9a5',
	bath: '#b9e3dc',
	hall: '#dcdcd6',
	utility: '#d9cfe6'
};

const FURNITURE_COLORS: Record<string, string> = {
	bed: '#7c8db5',
	sofa: '#8a9a6b',
	table: '#a07850',
	counter: '#9aa0a6',
	fridge: '#e6e8ea',
	tub: '#f5f7f8',
	toilet: '#f5f7f8',
	sink: '#eceff1',
	washer: '#e6e8ea',
	wardrobe: '#c4a882'
};

/** PBR maps for the photoreal look: wood for dry rooms, tile for kitchen, bath and utility. */
export interface FloorMaps {
	wood: { map: Texture; normalMap: Texture; roughnessMap: Texture };
	tile: { map: Texture; normalMap: Texture; roughnessMap: Texture };
}

const WET_ROOMS = new Set(['kitchen', 'bath', 'utility']);
/** Metres covered by one repeat of each texture. */
const TEXTURE_METRES = { wood: 2, tile: 1 };

export interface BuildResult {
	group: Group;
	materials: (MeshStandardMaterial | MeshBasicMaterial)[];
	/** Milliseconds spent generating and merging geometry. */
	buildMs: number;
	counts: { walls: number; openings: number; rooms: number; furniture: number; pieces: number };
}

const wallLength = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);

/** A box spanning [s, e] metres along the wall, from height y0 to y1. */
function wallPiece(w: Wall, s: number, e: number, y0: number, y1: number, t = w.t): BoxGeometry {
	const len = wallLength(w);
	const ux = (w.b[0] - w.a[0]) / len;
	const uy = (w.b[1] - w.a[1]) / len;
	const mid = (s + e) / 2;
	const geo = new BoxGeometry(e - s, y1 - y0, t);
	geo.rotateY(Math.atan2(uy, ux));
	geo.translate(w.a[0] + ux * mid, (y0 + y1) / 2, -(w.a[1] + uy * mid));
	return geo;
}

/** A box centred at plan (cx, cy), `lu` long along unit vector (ux, uy) and `ln` along its normal. */
function orientedBox(
	cx: number,
	cy: number,
	ux: number,
	uy: number,
	lu: number,
	ln: number,
	y0: number,
	y1: number
): BoxGeometry {
	const geo = new BoxGeometry(lu, y1 - y0, ln);
	geo.rotateY(Math.atan2(uy, ux));
	geo.translate(cx, (y0 + y1) / 2, -cy);
	return geo;
}

/** Window frames are matte black, door casings and sills white trim, handles brushed metal. */
const TRIM = { window: '#1f2124', casing: '#f6f5f1', handle: '#8d9096' };
/** Baseboard height and how far it stands proud of each wall face. */
const BASEBOARD = { h: 0.08, proud: 0.015 };

function paint(geo: BufferGeometry, hex: string): BufferGeometry {
	const c = new Color(hex);
	const n = geo.getAttribute('position').count;
	const colors = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
	geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
	return geo;
}

function furnitureBox(f: Furniture): BufferGeometry {
	const geo = new BoxGeometry(f.w, f.h, f.d);
	geo.rotateY((f.rot * Math.PI) / 180);
	geo.translate(f.x, f.h / 2, -f.y);
	return paint(geo, FURNITURE_COLORS[f.type] ?? '#b0a99f');
}

/**
 * Realistic-path trim for one opening: window frame + mullion + sill, or door casing + an open slab
 * with lever handles. Members overlap the opening by 1–2 cm so their faces never sit on the wall's
 * cut faces (which would z-fight), and everything is clamped to the cut height.
 */
function trim(
	w: Wall,
	o: Opening & { s: number; e: number },
	ux: number,
	uy: number,
	top: number,
	doors: BufferGeometry[],
	frames: BufferGeometry[]
) {
	const T = w.t + 0.04; // frame members stand 2 cm proud of both wall faces
	const add = (s: number, e: number, y0: number, y1: number, t: number, hex: string) => {
		const hi = Math.min(y1, top);
		if (hi > y0 + 0.001) frames.push(paint(wallPiece(w, s, e, y0, hi, t), hex));
	};
	if (o.kind === 'window') {
		const head = o.sill + o.h;
		add(o.s - 0.04, o.s + 0.02, o.sill, head, T, TRIM.window);
		add(o.e - 0.02, o.e + 0.04, o.sill, head, T, TRIM.window);
		add(o.s - 0.04, o.e + 0.04, head - 0.02, head + 0.04, T, TRIM.window);
		const mid = (o.s + o.e) / 2;
		add(mid - 0.02, mid + 0.02, o.sill, head, 0.04, TRIM.window);
		if (o.sill > 0.05)
			add(o.s - 0.07, o.e + 0.07, o.sill - 0.04, o.sill + 0.02, w.t + 0.1, TRIM.casing);
		return;
	}
	add(o.s - 0.07, o.s + 0.01, 0, o.h, T, TRIM.casing);
	add(o.e - 0.01, o.e + 0.07, 0, o.h, T, TRIM.casing);
	add(o.s - 0.07, o.e + 0.07, o.h - 0.01, o.h + 0.07, T, TRIM.casing);
	// Slab swung open 90° from the hinge at the opening's start, just clear of the casing.
	const slabT = 0.045;
	const [nx, ny] = [-uy, ux];
	const hu = o.s + 0.01 + slabT / 2;
	const hx = w.a[0] + ux * hu;
	const hy = w.a[1] + uy * hu;
	const off = w.t / 2 + 0.025;
	const leafW = o.w - 0.03;
	const y1 = Math.min(o.h - 0.015, top);
	if (y1 > 0.02) {
		const c = off + leafW / 2;
		doors.push(orientedBox(hx + nx * c, hy + ny * c, ux, uy, slabT, leafW, 0.01, y1));
	}
	if (top > 1.02) {
		// Lever handles on both faces, near the free edge.
		const c = off + leafW - 0.09;
		for (const side of [-1, 1]) {
			const d = side * (slabT / 2 + 0.025);
			const [cx, cy] = [hx + nx * c + ux * d, hy + ny * c + uy * d];
			frames.push(paint(orientedBox(cx, cy, ux, uy, 0.05, 0.13, 0.98, 1.0), TRIM.handle));
		}
	}
}

/** Lays a flat XY geometry into plan space (x, -z) with its front face and normals pointing down. */
function facingDown(geo: BufferGeometry): BufferGeometry {
	geo.rotateX(-Math.PI / 2);
	const index = geo.getIndex();
	if (index) {
		for (let i = 0; i < index.count; i += 3) {
			const b = index.getX(i + 1);
			index.setX(i + 1, index.getX(i + 2));
			index.setX(i + 2, b);
		}
	}
	const normal = geo.getAttribute('normal');
	for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, -1, 0);
	return geo;
}

function inside([x, y]: Point, poly: Point[]): boolean {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

/** One recessed downlight per room, two along the long axis of rooms longer than 3.5 m. */
function downlightSpots(poly: Point[]): Point[] {
	const xs = poly.map((p) => p[0]);
	const ys = poly.map((p) => p[1]);
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
	const long = Math.max(x1 - x0, y1 - y0);
	const spots: Point[] =
		long <= 3.5
			? [[cx, cy]]
			: x1 - x0 >= y1 - y0
				? [
						[x0 + (x1 - x0) / 4, cy],
						[x1 - (x1 - x0) / 4, cy]
					]
				: [
						[cx, y0 + (y1 - y0) / 4],
						[cx, y1 - (y1 - y0) / 4]
					];
	return spots.filter((p) => inside(p, poly));
}

function buildStory(story: Story, cut: number, realistic: boolean) {
	const top = Math.min(cut, story.height);
	const walls: BufferGeometry[] = [];
	const caps: BufferGeometry[] = [];
	const glass: BufferGeometry[] = [];
	const doors: BufferGeometry[] = [];
	const frames: BufferGeometry[] = [];
	const baseboards: BufferGeometry[] = [];
	for (const w of story.walls) {
		const len = wallLength(w);
		const ux = (w.b[0] - w.a[0]) / len;
		const uy = (w.b[1] - w.a[1]) / len;
		const openings = story.openings
			.filter((o) => o.wallId === w.id)
			.map((o) => ({ ...o, s: o.pos * len - o.w / 2, e: o.pos * len + o.w / 2 }))
			.sort((x, y) => x.s - y.s);
		// Extend each wall by half its thickness so corners overlap instead of leaving gaps.
		let cursor = -w.t / 2;
		for (const o of openings) {
			if (o.s > cursor) walls.push(wallPiece(w, cursor, o.s, 0, top));
			if (o.sill > 0) walls.push(wallPiece(w, o.s, o.e, 0, Math.min(o.sill, top)));
			if (o.sill + o.h < top) walls.push(wallPiece(w, o.s, o.e, o.sill + o.h, top));
			if (o.kind === 'window' && o.sill < top)
				glass.push(wallPiece(w, o.s, o.e, o.sill, Math.min(o.sill + o.h, top), 0.02));
			if (o.kind === 'door' && !realistic) {
				// Leaf swung open 90° from the hinge at the opening's start.
				const leaf = new BoxGeometry(0.04, Math.min(o.h, top), o.w);
				leaf.rotateY(Math.atan2(uy, ux));
				const hx = w.a[0] + ux * o.s - uy * (w.t / 2 + o.w / 2);
				const hy = w.a[1] + uy * o.s + ux * (w.t / 2 + o.w / 2);
				leaf.translate(hx + ux * 0.02, Math.min(o.h, top) / 2, -(hy + uy * 0.02));
				doors.push(leaf);
			}
			if (realistic) trim(w, o, ux, uy, top, doors, frames);
			cursor = Math.max(cursor, o.e);
		}
		if (cursor < len + w.t / 2) walls.push(wallPiece(w, cursor, len + w.t / 2, 0, top));
		// Marketing-style floor plans draw the cut tops of walls dark so the layout reads at a glance.
		if (realistic) caps.push(wallPiece(w, -w.t / 2, len + w.t / 2, top, top + 0.015, w.t + 0.002));
		if (realistic && top > BASEBOARD.h) {
			// One box 2 × proud thicker than the wall gives a baseboard on both faces. Runs stop at
			// doors (under the casing) and reach past the wall ends so they close the corners.
			const ext = w.t / 2 + BASEBOARD.proud;
			const t = w.t + 2 * BASEBOARD.proud;
			let s0 = -ext;
			for (const o of openings) {
				if (o.kind !== 'door') continue;
				if (o.s - 0.02 > s0) baseboards.push(wallPiece(w, s0, o.s - 0.02, 0, BASEBOARD.h, t));
				s0 = Math.max(s0, o.e + 0.02);
			}
			if (s0 < len + ext) baseboards.push(wallPiece(w, s0, len + ext, 0, BASEBOARD.h, t));
		}
	}
	const floors: BufferGeometry[] = [];
	const floorsWood: BufferGeometry[] = [];
	const floorsTile: BufferGeometry[] = [];
	const ceiling: BufferGeometry[] = [];
	const lights: BufferGeometry[] = [];
	for (const r of story.rooms) {
		const shape = new Shape(r.polygon.map(([x, y]) => new Vector2(x, y)));
		const geo = new ShapeGeometry(shape); // UVs are plan metres
		geo.rotateX(-Math.PI / 2);
		geo.translate(0, 0.002, 0);
		if (!realistic) floors.push(paint(geo, ROOM_COLORS[r.type] ?? '#dddddd'));
		else (WET_ROOMS.has(r.type) ? floorsTile : floorsWood).push(geo);
		if (realistic && cut >= story.height) {
			// The ceiling faces down, so it shows from inside a room and back-face culling hides it
			// when the camera looks down from above (the full-height view stays readable).
			const c = facingDown(new ShapeGeometry(shape));
			c.translate(0, story.height - 0.005, 0);
			ceiling.push(c);
			for (const [x, y] of downlightSpots(r.polygon)) {
				const d = facingDown(new CircleGeometry(0.07, 20));
				d.translate(x, story.height - 0.008, -y);
				lights.push(d);
			}
		}
	}
	const furniture = story.furniture.map(furnitureBox);
	return {
		walls,
		caps,
		glass,
		doors,
		frames,
		baseboards,
		floors,
		floorsWood,
		floorsTile,
		ceiling,
		lights,
		furniture
	};
}

function floorMaterial(maps: FloorMaps['wood'], metres: number): MeshStandardMaterial {
	for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) {
		t.wrapS = t.wrapT = RepeatWrapping;
		t.repeat.set(1 / metres, 1 / metres);
	}
	maps.map.colorSpace = SRGBColorSpace;
	return new MeshStandardMaterial({ ...maps, roughness: 1 });
}

/** Without `floorMaps` floors are tinted by room type (Low); with them the photoreal look is used. */
export function buildPlan(plan: Plan, cut = Infinity, floorMaps?: FloorMaps): BuildResult {
	const t0 = performance.now();
	const realistic = Boolean(floorMaps);
	const parts = {
		walls: [],
		caps: [],
		glass: [],
		doors: [],
		frames: [],
		baseboards: [],
		floors: [],
		floorsWood: [],
		floorsTile: [],
		ceiling: [],
		lights: [],
		furniture: []
	} as Record<
		| 'walls'
		| 'caps'
		| 'glass'
		| 'doors'
		| 'frames'
		| 'baseboards'
		| 'floors'
		| 'floorsWood'
		| 'floorsTile'
		| 'ceiling'
		| 'lights'
		| 'furniture',
		BufferGeometry[]
	>;
	for (const story of plan.stories) {
		const s = buildStory(story, cut, realistic);
		for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
			for (const g of s[key]) g.translate(0, story.elevation, 0);
			parts[key].push(...s[key]);
		}
	}
	const pieces = parts.walls.length;
	const materials = {
		walls: new MeshStandardMaterial({
			color: realistic ? '#f7f6f3' : '#efe9de',
			roughness: realistic ? 0.85 : 0.9
		}),
		caps: new MeshStandardMaterial({ color: '#2b2b2d', roughness: 0.6 }),
		glass: new MeshStandardMaterial({
			color: '#9ecbff',
			transparent: true,
			opacity: 0.35,
			depthWrite: false,
			roughness: 0.1
		}),
		doors: new MeshStandardMaterial({
			color: realistic ? '#f4f3ef' : '#b08560',
			roughness: realistic ? 0.5 : 0.7
		}),
		frames: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
		baseboards: new MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.5 }),
		floors: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
		floorsWood: floorMaps
			? floorMaterial(floorMaps.wood, TEXTURE_METRES.wood)
			: new MeshStandardMaterial(),
		floorsTile: floorMaps
			? floorMaterial(floorMaps.tile, TEXTURE_METRES.tile)
			: new MeshStandardMaterial(),
		ceiling: new MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.9 }),
		// Unlit so the discs read as glowing (an emissive standard material stalled the WebGPU post
		// pipeline in testing).
		lights: new MeshBasicMaterial({ color: '#fff6e6' }),
		furniture: new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })
	};
	const group = new Group();
	for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
		if (!parts[key].length) continue;
		const merged = mergeGeometries(parts[key]);
		for (const g of parts[key]) g.dispose();
		const mesh = new Mesh(merged, materials[key]);
		mesh.name = key;
		// Glass neither casts nor receives; floors only receive.
		mesh.castShadow = key === 'walls' || key === 'doors' || key === 'frames' || key === 'furniture';
		mesh.receiveShadow = !['glass', 'caps', 'lights', 'ceiling'].includes(key);
		group.add(mesh);
	}
	const story = plan.stories[0];
	return {
		group,
		materials: Object.values(materials),
		buildMs: performance.now() - t0,
		counts: {
			walls: story.walls.length,
			openings: story.openings.length,
			rooms: story.rooms.length,
			furniture: story.furniture.length,
			pieces
		}
	};
}

export function disposeBuild(result: BuildResult) {
	result.group.traverse((o) => {
		if (o instanceof Mesh) o.geometry.dispose();
	});
	for (const m of result.materials) m.dispose();
}
