// First-person walkthrough: WASD / arrow keys to move, PointerLockControls for mouse look (drag to
// look where pointer lock is unavailable), and circle-vs-segment collision against the plan's walls.
// The collision helpers are pure and work in plan metres (x east, y north); three uses (x, -z).
import { Euler, type PerspectiveCamera, Vector3 } from 'three/webgpu';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { Point, Story } from '../types.ts';
import { area, centroid } from '../validate.ts';

/** A solid stretch of wall: the segment a→b, inflated by half its thickness. */
export interface Segment {
	a: Point;
	b: Point;
	/** Half the wall thickness. */
	half: number;
}

export const EYE_HEIGHT = 1.6;
export const RADIUS = 0.25;
export const WALK_SPEED = 1.4;
export const RUN_FACTOR = 2.2;
export const WALK_FOV = 68;

/** Wall pieces that block movement. Door openings carve gaps; windows do not (their sill blocks). */
export function wallSegments(story: Pick<Story, 'walls' | 'openings'>): Segment[] {
	const segs: Segment[] = [];
	for (const w of story.walls) {
		const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
		if (len === 0) continue;
		const ux = (w.b[0] - w.a[0]) / len;
		const uy = (w.b[1] - w.a[1]) / len;
		const at = (s: number): Point => [w.a[0] + ux * s, w.a[1] + uy * s];
		const doors = story.openings
			.filter((o) => o.wallId === w.id && o.kind === 'door')
			.map((o) => ({ s: o.pos * len - o.w / 2, e: o.pos * len + o.w / 2 }))
			.sort((x, y) => x.s - y.s);
		let cursor = 0;
		for (const d of doors) {
			if (d.s > cursor) segs.push({ a: at(cursor), b: at(d.s), half: w.t / 2 });
			cursor = Math.max(cursor, d.e);
		}
		if (cursor < len) segs.push({ a: at(cursor), b: at(len), half: w.t / 2 });
	}
	return segs;
}

/** Closest point to p on segment a→b. */
function closest(p: Point, a: Point, b: Point): Point {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const l2 = dx * dx + dy * dy;
	const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
	return [a[0] + dx * t, a[1] + dy * t];
}

/** Push a circle at p out of every segment it overlaps. A few passes settle corners. */
function pushOut(p: Point, radius: number, segs: Segment[]): Point {
	let [x, y] = p;
	for (let pass = 0; pass < 4; pass++) {
		let moved = false;
		for (const s of segs) {
			const [cx, cy] = closest([x, y], s.a, s.b);
			const dx = x - cx;
			const dy = y - cy;
			const min = radius + s.half;
			const d = Math.hypot(dx, dy);
			if (d >= min) continue;
			if (d > 1e-9) {
				x = cx + (dx / d) * min;
				y = cy + (dy / d) * min;
			} else {
				// Dead centre on the wall line: push along the wall's normal.
				const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
				x = cx - ((s.b[1] - s.a[1]) / len) * min;
				y = cy + ((s.b[0] - s.a[0]) / len) * min;
			}
			moved = true;
		}
		if (!moved) break;
	}
	return [x, y];
}

/**
 * Move a circle of `radius` from `from` by `delta`, stopping at walls and sliding along them.
 * Long moves are split into steps shorter than the radius so the circle can't tunnel through a wall.
 */
export function move(from: Point, delta: Point, segs: Segment[], radius = RADIUS): Point {
	const dist = Math.hypot(delta[0], delta[1]);
	const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
	let p: Point = [from[0], from[1]];
	for (let i = 0; i < steps; i++)
		p = pushOut([p[0] + delta[0] / steps, p[1] + delta[1] / steps], radius, segs);
	return p;
}

/** Distance along a ray from p in direction (dx, dy) to the first wall line, capped at `max`. */
function rayDistance(p: Point, dx: number, dy: number, segs: Segment[], max = 50): number {
	let best = max;
	for (const s of segs) {
		const ex = s.b[0] - s.a[0];
		const ey = s.b[1] - s.a[1];
		const den = dx * ey - dy * ex;
		if (Math.abs(den) < 1e-9) continue;
		const qx = s.a[0] - p[0];
		const qy = s.a[1] - p[1];
		const t = (qx * ey - qy * ex) / den;
		const u = (qx * dy - qy * dx) / den;
		if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
	}
	return best;
}

/** Where to stand on entering: the largest room's centroid, facing its longest open sightline. */
export function startPose(story: Story, segs: Segment[]): { pos: Point; dir: Point } {
	const room = [...story.rooms].sort((x, y) => area(y.polygon) - area(x.polygon))[0];
	const pos = pushOut(room ? centroid(room.polygon) : [0, 0], RADIUS, segs);
	let dir: Point = [1, 0];
	let far = -1;
	for (let i = 0; i < 24; i++) {
		const a = (i / 24) * Math.PI * 2;
		const d = rayDistance(pos, Math.cos(a), Math.sin(a), segs);
		if (d > far + 1e-6) {
			far = d;
			dir = [Math.cos(a), Math.sin(a)];
		}
	}
	return { pos, dir };
}

const MOVE_KEYS: Record<string, [number, number]> = {
	KeyW: [1, 0],
	ArrowUp: [1, 0],
	KeyS: [-1, 0],
	ArrowDown: [-1, 0],
	KeyA: [0, -1],
	ArrowLeft: [0, -1],
	KeyD: [0, 1],
	ArrowRight: [0, 1]
};

const typing = (e: Event) =>
	(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]') != null;

export interface Walk {
	/** Start listening for input. Call once the camera has reached eye level. */
	enable(): void;
	/** Stop listening and release the pointer. */
	disable(): void;
	setStory(story: Story): void;
	update(dt: number): void;
	dispose(): void;
}

export function createWalk(camera: PerspectiveCamera, dom: HTMLElement): Walk {
	const look = new PointerLockControls(camera, dom);
	const keys = new Set<string>();
	let segs: Segment[] = [];
	let elevation = 0;
	let enabled = false;
	let lockFailed = false;
	let drag: { x: number; y: number } | null = null;
	const euler = new Euler(0, 0, 0, 'YXZ');
	const forward = new Vector3();

	const onKeyDown = (e: KeyboardEvent) => {
		if (!enabled || typing(e)) return;
		if (e.code in MOVE_KEYS || e.key === 'Shift') {
			keys.add(e.code in MOVE_KEYS ? e.code : 'Shift');
			if (e.code.startsWith('Arrow')) e.preventDefault();
		}
	};
	const onKeyUp = (e: KeyboardEvent) => {
		keys.delete(e.code);
		if (e.key === 'Shift') keys.delete('Shift');
	};
	const onBlur = () => keys.clear();
	const onLockError = () => (lockFailed = true);
	const onPointerDown = (e: PointerEvent) => {
		if (!enabled) return;
		if (e.pointerType === 'mouse' && !lockFailed && 'requestPointerLock' in dom) look.lock();
		else drag = { x: e.clientX, y: e.clientY };
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!drag || look.isLocked) return;
		euler.setFromQuaternion(camera.quaternion);
		euler.y += (e.clientX - drag.x) * 0.005;
		euler.x += (e.clientY - drag.y) * 0.005;
		euler.x = Math.max(-1.45, Math.min(1.45, euler.x));
		camera.quaternion.setFromEuler(euler);
		drag = { x: e.clientX, y: e.clientY };
	};
	const onPointerUp = () => (drag = null);

	addEventListener('keydown', onKeyDown);
	addEventListener('keyup', onKeyUp);
	addEventListener('blur', onBlur);
	document.addEventListener('pointerlockerror', onLockError);
	dom.addEventListener('pointerdown', onPointerDown);
	addEventListener('pointermove', onPointerMove);
	addEventListener('pointerup', onPointerUp);

	return {
		enable() {
			enabled = true;
		},
		disable() {
			enabled = false;
			keys.clear();
			drag = null;
			if (look.isLocked) look.unlock();
		},
		setStory(story) {
			segs = wallSegments(story);
			elevation = story.elevation;
		},
		update(dt) {
			if (!enabled || !keys.size) return;
			let f = 0;
			let r = 0;
			for (const k of keys) {
				const m = MOVE_KEYS[k];
				if (m) [f, r] = [f + m[0], r + m[1]];
			}
			if (!f && !r) return;
			camera.getWorldDirection(forward);
			// Plan direction of the camera's heading: three (x, -z) → plan (x, y).
			const hl = Math.hypot(forward.x, forward.z) || 1;
			const fx = forward.x / hl;
			const fy = -forward.z / hl;
			// Right of heading (fx, fy) in plan coordinates is (fy, -fx).
			let dx = fx * f + fy * r;
			let dy = fy * f - fx * r;
			const n = Math.hypot(dx, dy);
			const step = WALK_SPEED * (keys.has('Shift') ? RUN_FACTOR : 1) * Math.min(dt, 0.1);
			dx = (dx / n) * step;
			dy = (dy / n) * step;
			const [x, y] = move([camera.position.x, -camera.position.z], [dx, dy], segs);
			camera.position.set(x, elevation + EYE_HEIGHT, -y);
		},
		dispose() {
			this.disable();
			removeEventListener('keydown', onKeyDown);
			removeEventListener('keyup', onKeyUp);
			removeEventListener('blur', onBlur);
			document.removeEventListener('pointerlockerror', onLockError);
			dom.removeEventListener('pointerdown', onPointerDown);
			removeEventListener('pointermove', onPointerMove);
			removeEventListener('pointerup', onPointerUp);
			look.dispose();
		}
	};
}
