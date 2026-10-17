// Plan → three.js meshes. Walls are box segments around openings (no CSG), floors are ShapeGeometry
// tinted per room type, and each surface class is merged into one mesh, so a unit is ~5 draw calls.
// Plan (x, y) maps to three (x, -z) with Y up.
import {
	BoxGeometry,
	BufferGeometry,
	Color,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshStandardMaterial,
	Shape,
	ShapeGeometry,
	Vector2
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Furniture, Plan, RoomType, Story, Wall } from '../types.ts';

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
	washer: '#e6e8ea'
};

export interface BuildResult {
	group: Group;
	materials: MeshStandardMaterial[];
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

function buildStory(story: Story, cut: number) {
	const top = Math.min(cut, story.height);
	const walls: BufferGeometry[] = [];
	const glass: BufferGeometry[] = [];
	const doors: BufferGeometry[] = [];
	for (const w of story.walls) {
		const len = wallLength(w);
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
			if (o.kind === 'door') {
				// Leaf swung open 90° from the hinge at the opening's start.
				const leaf = new BoxGeometry(0.04, Math.min(o.h, top), o.w);
				const ux = (w.b[0] - w.a[0]) / len;
				const uy = (w.b[1] - w.a[1]) / len;
				leaf.rotateY(Math.atan2(uy, ux));
				const hx = w.a[0] + ux * o.s - uy * (w.t / 2 + o.w / 2);
				const hy = w.a[1] + uy * o.s + ux * (w.t / 2 + o.w / 2);
				leaf.translate(hx + ux * 0.02, Math.min(o.h, top) / 2, -(hy + uy * 0.02));
				doors.push(leaf);
			}
			cursor = Math.max(cursor, o.e);
		}
		if (cursor < len + w.t / 2) walls.push(wallPiece(w, cursor, len + w.t / 2, 0, top));
	}
	const floors = story.rooms.map((r) => {
		const shape = new Shape(r.polygon.map(([x, y]) => new Vector2(x, y)));
		const geo = new ShapeGeometry(shape);
		geo.rotateX(-Math.PI / 2);
		geo.translate(0, 0.002, 0);
		return paint(geo, ROOM_COLORS[r.type] ?? '#dddddd');
	});
	const furniture = story.furniture.map(furnitureBox);
	return { walls, glass, doors, floors, furniture };
}

export function buildPlan(plan: Plan, cut = Infinity): BuildResult {
	const t0 = performance.now();
	const parts = { walls: [], glass: [], doors: [], floors: [], furniture: [] } as Record<
		'walls' | 'glass' | 'doors' | 'floors' | 'furniture',
		BufferGeometry[]
	>;
	for (const story of plan.stories) {
		const s = buildStory(story, cut);
		for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
			for (const g of s[key]) g.translate(0, story.elevation, 0);
			parts[key].push(...s[key]);
		}
	}
	const pieces = parts.walls.length;
	const materials = {
		walls: new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 }),
		glass: new MeshStandardMaterial({
			color: '#9ecbff',
			transparent: true,
			opacity: 0.35,
			depthWrite: false,
			roughness: 0.1
		}),
		doors: new MeshStandardMaterial({ color: '#b08560', roughness: 0.7 }),
		floors: new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
		furniture: new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
	};
	const group = new Group();
	for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
		if (!parts[key].length) continue;
		const merged = mergeGeometries(parts[key]);
		for (const g of parts[key]) g.dispose();
		const mesh = new Mesh(merged, materials[key]);
		mesh.name = key;
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
