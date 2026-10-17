import type { Furniture, Plan, Point } from './types.ts';

const EPS = 1e-6;

/** Shoelace area; positive for counter-clockwise polygons. */
export function signedArea(polygon: Point[]): number {
	let sum = 0;
	for (let i = 0; i < polygon.length; i++) {
		const [x1, y1] = polygon[i];
		const [x2, y2] = polygon[(i + 1) % polygon.length];
		sum += x1 * y2 - x2 * y1;
	}
	return sum / 2;
}

export const area = (polygon: Point[]) => Math.abs(signedArea(polygon));

export function centroid(polygon: Point[]): Point {
	const a = signedArea(polygon);
	if (Math.abs(a) < EPS) return polygon[0] ?? [0, 0];
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < polygon.length; i++) {
		const [x1, y1] = polygon[i];
		const [x2, y2] = polygon[(i + 1) % polygon.length];
		const cross = x1 * y2 - x2 * y1;
		cx += (x1 + x2) * cross;
		cy += (y1 + y2) * cross;
	}
	return [cx / (6 * a), cy / (6 * a)];
}

/** Point-in-polygon that counts points on the boundary as inside. */
export function contains(polygon: Point[], [px, py]: Point): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];
		const cross = (px - xi) * (yj - yi) - (py - yi) * (xj - xi);
		const onSegment =
			Math.abs(cross) < EPS &&
			px >= Math.min(xi, xj) - EPS &&
			px <= Math.max(xi, xj) + EPS &&
			py >= Math.min(yi, yj) - EPS &&
			py <= Math.max(yi, yj) + EPS;
		if (onSegment) return true;
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** Plan-space corners of a furniture box after rotation. */
export function furnitureCorners(f: Furniture): Point[] {
	const r = (f.rot * Math.PI) / 180;
	const cos = Math.cos(r);
	const sin = Math.sin(r);
	return [
		[-f.w / 2, -f.d / 2],
		[f.w / 2, -f.d / 2],
		[f.w / 2, f.d / 2],
		[-f.w / 2, f.d / 2]
	].map(([x, y]) => [f.x + x * cos - y * sin, f.y + x * sin + y * cos]);
}

/** Problems that would make the plan render wrongly; an empty list means it is valid. */
export function validatePlan(plan: Plan): string[] {
	const problems: string[] = [];
	if (!plan.stories?.length) return ['plan has no stories'];
	for (const story of plan.stories) {
		const walls = new Map(story.walls.map((w) => [w.id, w]));
		const rooms = new Map(story.rooms.map((r) => [r.id, r]));
		if (walls.size !== story.walls.length)
			problems.push(`story ${story.level}: duplicate wall ids`);
		for (const w of story.walls) {
			const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
			if (len < EPS) problems.push(`wall ${w.id}: zero length`);
			if (!(w.t > 0)) problems.push(`wall ${w.id}: thickness must be positive`);
		}
		for (const o of story.openings) {
			const w = walls.get(o.wallId);
			if (!w) {
				problems.push(`opening ${o.id}: unknown wall ${o.wallId}`);
				continue;
			}
			const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
			const c = o.pos * len;
			if (c - o.w / 2 < -EPS || c + o.w / 2 > len + EPS)
				problems.push(`opening ${o.id}: extends past the ends of wall ${w.id}`);
			if (o.sill < 0 || o.sill + o.h > story.height + EPS)
				problems.push(`opening ${o.id}: taller than the story`);
		}
		for (const r of story.rooms) {
			if (r.polygon.length < 3) problems.push(`room ${r.id}: needs at least 3 points`);
			else if (area(r.polygon) < EPS) problems.push(`room ${r.id}: zero area`);
		}
		for (const f of story.furniture) {
			const room = rooms.get(f.room);
			if (!room) {
				problems.push(`furniture ${f.id}: unknown room ${f.room}`);
				continue;
			}
			if (!furnitureCorners(f).every((p) => contains(room.polygon, p)))
				problems.push(`furniture ${f.id}: not inside room ${room.id}`);
		}
	}
	return problems;
}

/** Total floor area of a story's rooms, in m². */
export const floorArea = (plan: Plan, level = 0) =>
	(plan.stories.find((s) => s.level === level)?.rooms ?? []).reduce(
		(sum, r) => sum + area(r.polygon),
		0
	);
