// One utility function shared by the matcher (with extracted prefs) and the scorer (with a persona's
// hidden prefs), so "how well did we match" and "what did we rank" measure the same thing.
import type { Listing, Pref } from './types.ts';

const DAY = 86_400_000;

function listingValue(l: Listing, p: Pref): unknown {
	if (p.field === 'commute') return p.dest ? l.commute[p.dest] : null;
	return l[p.field];
}

/** 0..1, or null when the listing doesn't say. */
export function satisfaction(l: Listing, p: Pref): number | null {
	const v = listingValue(l, p);
	if (v === null || v === undefined) return null;

	if (p.field === 'pets') {
		// Pref value lists the pets the renter has; the listing must allow each of them.
		const have = (Array.isArray(p.value) ? p.value : [p.value]).map(String).filter((x) => x !== 'none');
		if (p.op === 'not_in' || !have.length) return 1;
		return have.every((pet) => v === 'both' || v === pet) ? 1 : 0;
	}

	if (p.op === 'in' || p.op === 'not_in') {
		const list = (Array.isArray(p.value) ? p.value : [p.value]).map((x) => String(x).toLowerCase());
		const hit = list.includes(String(v).toLowerCase());
		return (p.op === 'in') === hit ? 1 : 0;
	}

	if (p.op === 'eq') {
		// "Parking: no" means the renter doesn't need it, not that a garage is a minus.
		if (p.value === false) return 1;
		return v === p.value ? 1 : 0;
	}

	if (p.field === 'available') {
		const have = Date.parse(String(v));
		const want = Date.parse(String(p.value));
		if (Number.isNaN(have) || Number.isNaN(want)) return null;
		const lateDays = p.op === 'max' ? (have - want) / DAY : (want - have) / DAY;
		return lateDays <= 0 ? 1 : Math.max(0, 1 - lateDays / 30);
	}

	const have = Number(v);
	const want = Number(p.value);
	if (!Number.isFinite(have) || !Number.isFinite(want)) return null;
	const miss = p.op === 'max' ? have - want : want - have;
	if (miss <= 0) return 1;
	// How far past the limit before satisfaction hits 0.
	const tolerance =
		p.field === 'price'
			? want * 0.15
			: p.field === 'commute'
				? 20
				: p.field === 'floor'
					? 4
					: p.field === 'bedrooms'
						? 0.5
						: Math.max(1, Math.abs(want) * 0.25);
	return Math.max(0, 1 - miss / tolerance);
}

/** A hard preference is violated only by a known value that misses it. */
export function violates(l: Listing, p: Pref): boolean {
	const s = satisfaction(l, p);
	return s !== null && s < 1;
}

/** Weighted mean satisfaction in 0..1 (unknown counts as 0.5); -1 when a hard preference is violated. */
export function utility(l: Listing, prefs: Pref[]): number {
	let num = 0;
	let den = 0;
	for (const p of prefs) {
		if (p.hard && violates(l, p)) return -1;
		const w = Math.max(0, p.weight);
		num += w * (satisfaction(l, p) ?? 0.5);
		den += w;
	}
	return den ? num / den : 0.5;
}

/** Listings best-first; ties broken by id so runs are reproducible. */
export function rank(listings: Listing[], prefs: Pref[], exclude: Set<string> = new Set()): Listing[] {
	return listings
		.filter((l) => !exclude.has(l.id))
		.map((l) => ({ l, u: utility(l, prefs) }))
		.sort((a, b) => b.u - a.u || a.l.id.localeCompare(b.l.id))
		.map((x) => x.l);
}
