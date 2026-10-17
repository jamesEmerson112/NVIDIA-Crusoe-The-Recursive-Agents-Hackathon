// 3D blueprint for a listing, in James's Plan format (frontend/src/lib/floorplan/types.ts), so every
// listing opens in the three.js viewer. Room layout is a port of web/floorplan.js plan(): same
// rectangles per layout and bedroom count, converted from SVG pixels (6 px per foot, y down) to
// metres with plan y pointing north.
import type { Listing } from './types.ts';
import type {
	Plan,
	Wall,
	Opening,
	Room,
	Furniture,
	Point,
	RoomType
} from '../../frontend/src/lib/floorplan/types.ts';

const FT = 6; // SVG pixels per foot, as in floorplan.js
const PX = 0.3048 / FT; // metres per SVG pixel
const HEIGHT = 2.7;
const T_EXT = 0.2;
const T_INT = 0.1;

type R = { x: number; y: number; w: number; h: number };
type Cell = { name: string; r: R; bath?: boolean; bed?: boolean; small?: boolean; hall?: boolean; open?: boolean; kitchenRight?: boolean };

const rect = (x: number, y: number, w: number, h: number): R => ({ x, y, w, h });

/** Port of floorplan.js plan(): room rectangles in SVG pixels. */
function cells(l: Listing) {
	const beds = Math.min(3, l.bedrooms ?? 1);
	const baths = Math.max(1, Math.min(2, Math.round(l.bathrooms ?? 1)));
	const sqft = l.sqft || [450, 650, 950, 1250][beds];
	const layout = l.layout || 'standard';
	const rooms: Cell[] = [];
	let W: number;
	let H: number;
	if (layout === 'railroad') {
		W = Math.sqrt(sqft / 3) * FT;
		H = (sqft * FT * FT) / W;
		const seq: Array<[string, number]> = [
			['LIVING', 1.3],
			...Array.from({ length: Math.max(1, beds) }, (): [string, number] => [beds ? 'BEDROOM' : 'SLEEPING', 1]),
			['KITCHEN', 0.8],
			['BATH', 0.45]
		];
		const total = seq.reduce((a, [, f]) => a + f, 0);
		let y = 0;
		for (const [name, f] of seq) {
			const h = (H * f) / total;
			rooms.push({ name, r: rect(0, y, W, h), bed: name === 'BEDROOM' || name === 'SLEEPING', bath: name === 'BATH' });
			y += h;
		}
	} else if (beds === 0) {
		W = Math.sqrt(sqft * 0.8) * FT;
		H = (sqft * FT * FT) / W;
		const top = H * 0.66;
		rooms.push({ name: layout === 'loft' ? 'LOFT' : 'LIVING / SLEEPING', r: rect(0, 0, W, top) });
		const wd = l.laundry === 'in_unit' ? Math.min(W * 0.16, 5 * FT) : 0;
		rooms.push({ name: 'BATH', r: rect(0, top, W * 0.4, H - top), bath: true });
		if (wd) rooms.push({ name: 'W/D', r: rect(W * 0.4, top, wd, H - top), small: true });
		rooms.push({ name: 'KITCHEN', r: rect(W * 0.4 + wd, top, W * 0.6 - wd, H - top), open: layout === 'open' || layout === 'loft' });
	} else if (beds >= 2) {
		W = Math.sqrt(sqft * 1.05) * FT;
		H = (sqft * FT * FT) / W;
		const leftW = W * 0.48;
		const ensuite = baths > 1;
		const ensH = ensuite ? Math.min(7.5 * FT, H * 0.2) : 0;
		const bedH = (H - ensH) / beds;
		let y = 0;
		for (let i = 0; i < beds; i++) {
			rooms.push({ name: 'BEDROOM', r: rect(0, y, leftW, bedH), bed: true });
			y += bedH;
			if (i === 0 && ensuite) {
				rooms.push({ name: 'ENSUITE', r: rect(0, y, leftW, ensH), bath: true });
				y += ensH;
			}
		}
		const rw = W - leftW;
		const livingH = H * 0.44;
		const kitchenH = H * 0.3;
		rooms.push({ name: rw < 17 * FT ? 'LIVING' : 'LIVING / DINING', r: rect(leftW, 0, rw, livingH) });
		rooms.push({ name: 'KITCHEN', r: rect(leftW, livingH, rw, kitchenH), open: layout === 'open' || layout === 'loft', kitchenRight: true });
		const by = livingH + kitchenH;
		rooms.push({ name: 'BATH', r: rect(leftW + rw * 0.4, by, rw * 0.6, H - by), bath: true });
		// The 2D W/D-or-closet cell is where the entry lands, so in 3D it doubles as the entry hall.
		rooms.push({ name: l.laundry === 'in_unit' ? 'ENTRY / W/D' : 'ENTRY / CLOSET', r: rect(leftW, by, rw * 0.4, H - by), small: true, hall: true });
	} else {
		W = Math.sqrt(sqft * 1.15) * FT;
		H = (sqft * FT * FT) / W;
		const leftW = W * 0.46;
		const bathH = Math.min(H * 0.3, 8 * FT);
		const bedH = Math.min(H - bathH, 14 * FT);
		rooms.push({ name: 'BEDROOM', r: rect(0, 0, leftW, bedH), bed: true });
		const rest = H - bedH - bathH;
		rooms.push({ name: 'BATH', r: rect(0, bedH, leftW, rest > 3.5 * FT ? bathH : H - bedH), bath: true });
		if (rest > 3.5 * FT) rooms.push({ name: l.laundry === 'in_unit' ? 'W/D' : 'CLOSET', r: rect(0, bedH + bathH, leftW, rest), small: true });
		const livingH = H * (layout === 'open' ? 0.62 : 0.58);
		const living = rect(leftW, 0, W - leftW, livingH);
		rooms.push({ name: living.w < 17 * FT ? 'LIVING' : 'LIVING / DINING', r: living });
		rooms.push({ name: 'KITCHEN', r: rect(leftW, livingH, W - leftW, H - livingH), open: layout === 'open' || layout === 'loft', kitchenRight: true });
	}
	return { W, H, rooms, layout, chamfer: layout === 'irregular' ? Math.min(W, H) * 0.18 : 0, beds, baths, sqft };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0; // mm, and no -0
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];

function signedArea(p: Point[]) {
	let s = 0;
	for (let i = 0; i < p.length; i++) {
		const [x1, y1] = p[i];
		const [x2, y2] = p[(i + 1) % p.length];
		s += x1 * y2 - x2 * y1;
	}
	return s / 2;
}

/** Keep the part of a polygon where a*x + b*y >= c (Sutherland-Hodgman). */
function clip(poly: Point[], a: number, b: number, c: number): Point[] {
	const out: Point[] = [];
	const f = (p: Point) => a * p[0] + b * p[1] - c;
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i];
		const q = poly[(i + 1) % poly.length];
		const fp = f(p);
		const fq = f(q);
		if (fp >= 0) out.push(p);
		if (fp * fq < 0) {
			const t = fp / (fp - fq);
			out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
		}
	}
	return out;
}

/** Point-in-polygon, boundary counts as inside (same rule as validatePlan). */
function contains(polygon: Point[], [px, py]: Point): boolean {
	const EPS = 1e-6;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];
		const cross = (px - xi) * (yj - yi) - (py - yi) * (xj - xi);
		if (
			Math.abs(cross) < EPS &&
			px >= Math.min(xi, xj) - EPS &&
			px <= Math.max(xi, xj) + EPS &&
			py >= Math.min(yi, yj) - EPS &&
			py <= Math.max(yi, yj) + EPS
		)
			return true;
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

type RoomRec = Room & { cell: Cell; box: { x0: number; y0: number; x1: number; y1: number } };
type Line = { d: Point; n: Point; off: number; segs: Array<{ lo: number; hi: number; room: string }> };
type WallRec = { wall: Wall; d: Point; n: Point; off: number; t0: number; t1: number };

function lineKey(p: Point, q: Point) {
	let dx = q[0] - p[0];
	let dy = q[1] - p[1];
	const len = Math.hypot(dx, dy);
	dx /= len;
	dy /= len;
	if (dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0)) {
		dx = -dx;
		dy = -dy;
	}
	const d: Point = [dx, dy];
	const n: Point = [-dy, dx];
	const off = dot(n, p);
	const key = `${Math.round(Math.atan2(dy, dx) * 1e4)}|${Math.round(off * 1e3)}`;
	const tp = dot(d, p);
	const tq = dot(d, q);
	return { key, d, n, off, lo: Math.min(tp, tq), hi: Math.max(tp, tq) };
}

function roomInfo(c: Cell, bedIndex: number, bathIndex: number): { id: string; name: string; type: RoomType } {
	const title = (s: string) => s.toLowerCase().replace(/(^|[\s/])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace('W/d', 'W/D');
	if (c.name === 'BEDROOM') return { id: `bed-${bedIndex}`, name: `Bedroom ${bedIndex}`, type: 'bedroom' };
	if (c.name === 'SLEEPING') return { id: 'sleeping', name: 'Sleeping', type: 'bedroom' };
	if (c.name === 'ENSUITE') return { id: 'ensuite', name: 'Ensuite', type: 'bath' };
	if (c.name === 'BATH') return { id: `bath-${bathIndex}`, name: bathIndex > 1 ? `Bath ${bathIndex}` : 'Bath', type: 'bath' };
	if (c.name === 'KITCHEN') return { id: 'kitchen', name: 'Kitchen', type: 'kitchen' };
	if (c.hall) return { id: 'entry', name: title(c.name), type: 'hall' };
	if (c.name === 'W/D') return { id: 'wd', name: 'W/D', type: 'utility' };
	if (c.name === 'CLOSET') return { id: 'closet', name: 'Closet', type: 'utility' };
	return { id: 'living', name: c.name === 'LOFT' ? 'Loft' : title(c.name), type: 'living' };
}

export function listingPlan(l: Listing): Plan {
	const p = cells(l);
	const Wm = p.W * PX;
	const Hm = p.H * PX;
	const cm = p.chamfer * PX;

	// Rooms: rectangles in metres, y flipped to north-up, counter-clockwise; the irregular layout
	// cuts both north corners like the 2D outline.
	const rooms: RoomRec[] = [];
	let bedN = 0;
	let bathN = 0;
	for (const c of p.rooms) {
		if (c.name === 'BEDROOM') bedN++;
		if (c.name === 'BATH') bathN++;
		const x0 = c.r.x * PX;
		const x1 = (c.r.x + c.r.w) * PX;
		const y0 = (p.H - c.r.y - c.r.h) * PX;
		const y1 = (p.H - c.r.y) * PX;
		let poly: Point[] = [
			[x0, y0],
			[x1, y0],
			[x1, y1],
			[x0, y1]
		];
		if (cm > 0) {
			poly = clip(poly, 1, -1, cm - Hm); // north-west corner
			poly = clip(poly, -1, -1, cm - Wm - Hm); // north-east corner
		}
		poly = poly.map(([x, y]): Point => [r3(x), r3(y)]).filter((q, i, a) => {
			const prev = a[(i + a.length - 1) % a.length];
			return Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 1e-3;
		});
		if (signedArea(poly) < 0) poly.reverse();
		const info = roomInfo(c, bedN, bathN);
		rooms.push({ ...info, polygon: poly, cell: c, box: { x0: r3(x0), y0: r3(y0), x1: r3(x1), y1: r3(y1) } });
	}
	const byId = new Map(rooms.map((r) => [r.id, r]));
	const openPair = (a: string, b: string) => {
		const ka = byId.get(a);
		const kb = byId.get(b);
		const k = ka?.type === 'kitchen' ? ka : kb?.type === 'kitchen' ? kb : null;
		const other = k === ka ? kb : ka;
		return !!k?.cell.open && other?.type === 'living';
	};

	// Walls: every room edge, grouped by line, split at every endpoint, deduped, then merged.
	const lines = new Map<string, Line>();
	for (const r of rooms) {
		for (let i = 0; i < r.polygon.length; i++) {
			const a = r.polygon[i];
			const b = r.polygon[(i + 1) % r.polygon.length];
			const k = lineKey(a, b);
			let line = lines.get(k.key);
			if (!line) lines.set(k.key, (line = { d: k.d, n: k.n, off: k.off, segs: [] }));
			line.segs.push({ lo: k.lo, hi: k.hi, room: r.id });
		}
	}
	const walls: WallRec[] = [];
	let extN = 0;
	let intN = 0;
	for (const line of lines.values()) {
		const ts = [...new Set(line.segs.flatMap((s) => [s.lo, s.hi]))].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 2e-3);
		const pieces: Array<{ t0: number; t1: number; ext: boolean }> = [];
		for (let i = 0; i + 1 < ts.length; i++) {
			const t0 = ts[i];
			const t1 = ts[i + 1];
			const cover = line.segs.filter((s) => s.lo <= t0 + 2e-3 && s.hi >= t1 - 2e-3);
			if (!cover.length) continue;
			if (cover.length === 2 && openPair(cover[0].room, cover[1].room)) continue;
			const ext = cover.length === 1;
			const last = pieces[pieces.length - 1];
			if (last && Math.abs(last.t1 - t0) < 2e-3 && last.ext === ext) last.t1 = t1;
			else pieces.push({ t0, t1, ext });
		}
		for (const pc of pieces) {
			const at = (t: number): Point => [r3(line.d[0] * t + line.n[0] * line.off), r3(line.d[1] * t + line.n[1] * line.off)];
			const wall: Wall = {
				id: pc.ext ? `ext-${++extN}` : `int-${++intN}`,
				a: at(pc.t0),
				b: at(pc.t1),
				t: pc.ext ? T_EXT : T_INT,
				exterior: pc.ext,
				party: false
			};
			walls.push({ wall, d: line.d, n: line.n, off: line.off, t0: pc.t0, t1: pc.t1 });
		}
	}

	const wallAt = (pt: Point, d: Point) =>
		walls.find(
			(w) =>
				Math.abs(Math.abs(dot(w.d, d)) - 1) < 1e-6 &&
				Math.abs(dot(w.n, pt) - w.off) < 2e-3 &&
				dot(w.d, pt) >= w.t0 - 1e-3 &&
				dot(w.d, pt) <= w.t1 + 1e-3
		);

	// Openings.
	const openings: Opening[] = [];
	let winN = 0;
	let doorN = 0;
	const addOpening = (pt: Point, d: Point, w: number, kind: 'door' | 'window', id?: string): boolean => {
		const rec = wallAt(pt, d);
		if (!rec) return false;
		const len = rec.t1 - rec.t0;
		const tc = dot(rec.d, pt) - rec.t0;
		if (tc - w / 2 < 0.05 || tc + w / 2 > len - 0.05) return false;
		const door = kind === 'door';
		openings.push({
			id: id ?? (door ? `door-${++doorN}` : `win-${++winN}`),
			wallId: rec.wall.id,
			pos: Math.round((tc / len) * 1e4) / 1e4,
			w: r3(w),
			h: door ? 2.1 : 1.8,
			sill: door ? 0 : 0.6,
			kind
		});
		return true;
	};

	const edges = (r: RoomRec) =>
		r.polygon.map((a, i) => {
			const b = r.polygon[(i + 1) % r.polygon.length];
			const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
			return { a, b, len, d, out: [d[1], -d[0]] as Point };
		});
	const isExterior = (pt: Point, d: Point) => wallAt(pt, d)?.wall.exterior === true;

	// Windows: north and side exterior walls of living rooms and bedrooms (side only off railroad, as in 2D).
	for (const r of rooms) {
		if (r.type !== 'living' && r.type !== 'bedroom') continue;
		for (const e of edges(r)) {
			const mid: Point = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
			if (!isExterior(mid, e.d)) continue;
			if (e.out[1] < -0.5) continue; // south side
			const side = Math.abs(e.out[0]) > 0.9;
			if (side && p.layout === 'railroad') continue;
			const n = Math.min(2, Math.max(1, Math.round(e.len / 2.74)));
			const w = Math.min(1.2, e.len / n - 0.5);
			if (w < 0.5) continue;
			for (let i = 0; i < n; i++) {
				const s = (e.len / n) * (i + 0.5);
				addOpening([e.a[0] + e.d[0] * s, e.a[1] + e.d[1] * s], e.d, w, 'window');
			}
		}
	}

	// Interior doors: shared edge between two rooms, placed near one end of the shared stretch.
	const shared = (a: string, b: string) => {
		let best: { lo: number; hi: number; line: Line } | null = null;
		for (const line of lines.values()) {
			for (const sa of line.segs.filter((s) => s.room === a))
				for (const sb of line.segs.filter((s) => s.room === b)) {
					const lo = Math.max(sa.lo, sb.lo);
					const hi = Math.min(sa.hi, sb.hi);
					if (hi - lo > 1e-3 && (!best || hi - lo > best.hi - best.lo)) best = { lo, hi, line };
				}
		}
		return best;
	};
	const connected = new Set<string>();
	const doorBetween = (a: string, b: string, frac?: number): boolean => {
		const s = shared(a, b);
		if (!s) return false;
		const len = s.hi - s.lo;
		const w = len >= 1.1 ? 0.8 : len - 0.3;
		if (w < 0.6) return false;
		const tc = frac != null ? Math.min(s.hi - w / 2 - 0.15, Math.max(s.lo + w / 2 + 0.15, s.lo + len * frac)) : s.lo + Math.min(len / 2, w / 2 + 0.3);
		const pt: Point = [s.line.d[0] * tc + s.line.n[0] * s.line.off, s.line.d[1] * tc + s.line.n[1] * s.line.off];
		if (!wallAt(pt, s.line.d)) {
			// Open plan: no wall here, the rooms already connect.
			connected.add(a).add(b);
			return true;
		}
		if (!addOpening(pt, s.line.d, w, 'door')) return false;
		connected.add(a).add(b);
		return true;
	};

	if (p.layout === 'railroad') {
		for (let i = 1; i < rooms.length; i++) doorBetween(rooms[i - 1].id, rooms[i].id, 0.7);
	} else {
		const prefs: Record<RoomType, RoomType[]> = {
			bedroom: ['living', 'hall', 'kitchen'],
			bath: ['hall', 'living', 'kitchen', 'bedroom'],
			utility: ['hall', 'kitchen', 'living', 'bedroom'],
			kitchen: ['living', 'hall'],
			hall: ['kitchen', 'living'],
			living: []
		};
		for (const r of rooms) {
			if (r.type === 'living') continue;
			const order: RoomRec[] = [];
			if (r.id === 'ensuite') order.push(byId.get('bed-1')!);
			for (const t of prefs[r.type]) order.push(...rooms.filter((o) => o.type === t && o.id !== r.id));
			for (const o of order) if (doorBetween(r.id, o.id)) break;
		}
	}

	// Entry door on the south exterior wall, where the 2D plan draws it; railroad units (bath across
	// the whole south end) enter through the kitchen's side wall instead.
	{
		const ex = (p.beds === 0 ? p.W * 0.7 : p.W * 0.6) * PX;
		const w = 0.9;
		const pub = rooms.filter((r) => r.type === 'living' || r.type === 'kitchen' || r.type === 'hall');
		const south = pub.flatMap((r) => edges(r).filter((e) => e.out[1] < -0.9 && isExterior([(e.a[0] + e.b[0]) / 2, e.a[1]], e.d)));
		const pick = south.find((e) => ex >= Math.min(e.a[0], e.b[0]) && ex <= Math.max(e.a[0], e.b[0])) ?? south.sort((a, b) => b.len - a.len)[0];
		let done = false;
		if (pick && pick.len >= w + 0.4) {
			const x0 = Math.min(pick.a[0], pick.b[0]);
			const x1 = Math.max(pick.a[0], pick.b[0]);
			const x = Math.min(x1 - w / 2 - 0.2, Math.max(x0 + w / 2 + 0.2, ex));
			done = addOpening([x, pick.a[1]], pick.d, w, 'door', 'entry');
		}
		if (!done) {
			const side = pub.flatMap((r) => edges(r).filter((e) => Math.abs(e.out[0]) > 0.9 && e.len >= w + 0.4 && isExterior([e.a[0], (e.a[1] + e.b[1]) / 2], e.d)));
			const k = side.find((e) => rooms.find((r) => r.type === 'kitchen' && r.polygon.includes(e.a))) ?? side[0];
			if (k) addOpening([k.a[0], (k.a[1] + k.b[1]) / 2], k.d, w, 'door', 'entry');
		}
	}

	// Furniture: boxes placed at preferred spots, then a grid search; anything that cannot fit
	// inside its room (with clearance) is left out, so the plan always validates.
	const furniture: Furniture[] = [];
	const corners = (x: number, y: number, w: number, d: number, rot: number): Point[] => {
		const q = (rot * Math.PI) / 180;
		const cos = Math.cos(q);
		const sin = Math.sin(q);
		return [
			[-w / 2, -d / 2],
			[w / 2, -d / 2],
			[w / 2, d / 2],
			[-w / 2, d / 2]
		].map(([a, b]): Point => [x + a * cos - b * sin, y + a * sin + b * cos]);
	};
	const aabb = (pts: Point[]) => ({
		x0: Math.min(...pts.map((q) => q[0])),
		x1: Math.max(...pts.map((q) => q[0])),
		y0: Math.min(...pts.map((q) => q[1])),
		y1: Math.max(...pts.map((q) => q[1]))
	});
	const G = 0.08;
	let fN = 0;
	const place = (
		room: RoomRec,
		type: string,
		w: number,
		d: number,
		h: number,
		cands: Array<[number, number, number]>,
		opts: { grid?: boolean; clear?: number } = {}
	): Furniture | null => {
		const clear = opts.clear ?? G;
		const mine = furniture.filter((f) => f.room === room.id).map((f) => aabb(corners(f.x, f.y, f.w, f.d, f.rot)));
		const ok = ([x, y, rot]: [number, number, number]) => {
			if (!corners(x, y, w + 2 * clear, d + 2 * clear, rot).every((q) => contains(room.polygon, q))) return false;
			const b = aabb(corners(x, y, w, d, rot));
			return mine.every((m) => b.x1 + 0.05 <= m.x0 || m.x1 + 0.05 <= b.x0 || b.y1 + 0.05 <= m.y0 || m.y1 + 0.05 <= b.y0);
		};
		let hit = cands.find(ok);
		if (!hit && opts.grid !== false) {
			const { x0, y0, x1, y1 } = room.box;
			outer: for (const rot of [0, 90])
				for (let y = y0; y <= y1; y += 0.15)
					for (let x = x0; x <= x1; x += 0.15)
						if (ok([x, y, rot])) {
							hit = [x, y, rot];
							break outer;
						}
		}
		if (!hit) return null;
		const f: Furniture = { id: `f${++fN}-${type}`, type, room: room.id, x: r3(hit[0]), y: r3(hit[1]), w, d, h, rot: hit[2] };
		// Rounding can nudge a box onto the wall; keep only boxes that still fit.
		if (!corners(f.x, f.y, f.w, f.d, f.rot).every((q) => contains(room.polygon, q))) return null;
		furniture.push(f);
		return f;
	};

	for (const room of rooms) {
		const { x0, y0, x1, y1 } = room.box;
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		if (room.type === 'bedroom' || (room.type === 'living' && p.beds === 0)) {
			const studio = room.type === 'living';
			const bedC = (bw: number, bd: number): Array<[number, number, number]> =>
				studio
					? [
							[x0 + G + bd / 2, cy + 0.6, 90],
							[x0 + G + bd / 2, cy, 90],
							[cx, y1 - G - bd / 2, 0]
						]
					: [
							[cx, y1 - G - bd / 2, 0],
							[x0 + G + bd / 2, cy, 90],
							[x1 - G - bd / 2, cy, 90],
							[cx, y0 + G + bd / 2, 0]
						];
			if (!place(room, 'bed', 1.6, 2.0, 0.5, bedC(1.6, 2.0), { grid: false })) place(room, 'bed', 1.4, 1.9, 0.5, bedC(1.4, 1.9));
			if (!studio)
				place(room, 'wardrobe', 1.2, 0.6, 2.0, [
					[x1 - G - 0.6, y0 + G + 0.3, 0],
					[x0 + G + 0.6, y0 + G + 0.3, 0],
					[x1 - G - 0.3, y0 + G + 0.6, 90],
					[x0 + G + 0.3, y0 + G + 0.6, 90]
				]);
		}
		if (room.type === 'living') {
			const sofa = place(room, 'sofa', 2.0, 0.9, 0.8, [
				[cx, y0 + G + 0.45, 0],
				[x1 - G - 0.45, cy, 90],
				[x0 + G + 0.45, cy, 90],
				[cx, y1 - G - 0.45, 0]
			]);
			if (sofa) {
				const gap = 0.45 + 0.4 + 0.3;
				const c: Array<[number, number, number]> =
					sofa.rot === 0
						? [[sofa.x, sofa.y < cy ? sofa.y + gap : sofa.y - gap, 0]]
						: [[sofa.x < cx ? sofa.x + gap : sofa.x - gap, sofa.y, 90]];
				place(room, 'table', 1.0, 0.6, 0.45, c, { grid: false });
			}
			const big = (x1 - x0) * (y1 - y0) > 18;
			if (big)
				place(
					room,
					'table',
					1.4,
					0.9,
					0.75,
					[
						[x1 - 1.2, y1 - 1.0, 0],
						[x0 + 1.2, y1 - 1.0, 0],
						[cx, y1 - 1.0, 0]
					],
					{ clear: 0.4 }
				);
		}
		if (room.type === 'kitchen') {
			if (room.cell.kitchenRight && y1 - y0 - 2 * G >= 1.2) {
				const len = r3(y1 - y0 - 2 * G);
				place(room, 'counter', 0.6, len, 0.9, [[x1 - G - 0.3, cy, 0]]);
				place(room, 'fridge', 0.75, 0.7, 1.8, [
					[x0 + G + 0.375, y0 + G + 0.35, 0],
					[x0 + G + 0.375, y1 - G - 0.35, 0]
				]);
			} else {
				const len = r3(Math.min(x1 - x0 - 2 * G, Math.max(1.2, (x1 - x0) * 0.6)));
				place(room, 'counter', len, 0.6, 0.9, [[x0 + G + len / 2, y0 + G + 0.3, 0]]);
				place(room, 'fridge', 0.75, 0.7, 1.8, [
					[x1 - G - 0.375, y1 - G - 0.35, 0],
					[x1 - G - 0.375, y0 + G + 0.35, 0]
				]);
			}
		}
		if (room.type === 'bath') {
			const tw = Math.min(1.5, x1 - x0 - 2 * G - 0.8);
			if (tw >= 1.1) place(room, 'tub', r3(tw), 0.75, 0.55, [[x1 - G - tw / 2, y0 + G + 0.375, 0]], { grid: false });
			else place(room, 'tub', 0.75, 1.5, 0.55, [[x1 - G - 0.375, y1 - G - 0.75, 0]]);
			place(room, 'toilet', 0.45, 0.7, 0.75, [
				[x0 + G + 0.35, cy, 90],
				[x0 + G + 0.35, y0 + G + 0.225 + 0.3, 90]
			]);
			place(room, 'sink', 0.6, 0.45, 0.85, [
				[x0 + G + 0.3, y1 - G - 0.225, 0],
				[cx, y1 - G - 0.225, 0]
			]);
		}
		if ((room.type === 'utility' || room.type === 'hall') && /W\/D/.test(room.name))
			place(room, 'washer', 0.6, 0.6, 0.85, [
				[x0 + G + 0.3, y1 - G - 0.3, 0],
				[x1 - G - 0.3, y1 - G - 0.3, 0]
			]);
	}

	const label = p.beds === 0 ? 'Studio' : `${p.beds}BR`;
	return {
		id: `listing-${l.id}`,
		name: `${label} · ${Math.round(p.sqft)} sq ft · ${l.neighborhood} (generated)`,
		synthetic: true,
		origin: [0, 0],
		stories: [
			{
				level: 0,
				elevation: 0,
				height: HEIGHT,
				walls: walls.map((w) => w.wall),
				openings,
				rooms: rooms.map(({ id, name, type, polygon }): Room => ({ id, name, type, polygon })),
				furniture
			}
		]
	};
}
