// Deterministic persona generation and train/acceptance/held-out splits. No LLM.
// Generated personas borrow a seed persona's shape (which fields it cares about, its dealbreaker
// field) and randomize every value, weight and behavior. Held-out renters are always generated,
// never hand-written seeds, so editing research/personas.yaml can't leak into the final eval.

import { int, pick, rngFor, shuffle } from './rng.ts';
import type { Rng } from './rng.ts';
import { BEHAVIORS, NEIGHBORHOODS } from './types.ts';
import type { Destination, EvalConfig, Persona, Pref, PrefField } from './types.ts';

const GEN_PREFIX = 'gen_';
export const isGenerated = (p: Persona) => p.id.startsWith(GEN_PREFIX);

const FIRST = [
	'Alex', 'Bea', 'Carlos', 'Deja', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ines', 'Jamal', 'Kai', 'Lena',
	'Marco', 'Nia', 'Omar', 'Paula', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uma', 'Victor', 'Wen', 'Yusuf', 'Zoe'
];
const LAST = ['A.', 'B.', 'C.', 'D.', 'F.', 'G.', 'H.', 'K.', 'L.', 'M.', 'N.', 'O.', 'P.', 'R.', 'S.', 'T.', 'W.'];
const JOBS = [
	'a product designer', 'a line cook', 'a public school teacher', 'a data analyst', 'a physical therapist',
	'a law clerk', 'a barista finishing a degree', 'a software engineer', 'a museum educator', 'a nurse practitioner',
	'a bike mechanic', 'a city planner', 'a grad student', 'a freelance photographer', 'a biotech researcher'
];
const DEST_PHRASE: Record<Destination, string> = {
	fidi: 'who works downtown in FiDi',
	soma: 'who works in SoMa',
	mission_bay: 'who works out in Mission Bay',
	palo_alto: 'who commutes down to Palo Alto'
};
const BED_PHRASE = ['a studio', 'a one-bedroom', 'a two-bedroom', 'a three-bedroom'];
const CARE_PHRASE: Partial<Record<PrefField, string>> = {
	price: 'Watching the budget closely.',
	commute: 'A short commute matters a lot.',
	neighborhood: 'Has strong opinions about neighborhoods.',
	sqft: 'Wants room to spread out.',
	available: 'The move-in timing is awkward.',
	floor: 'Picky about which floor.',
	layout: 'Has lived in one too many weird layouts.',
	laundry: 'Done hauling laundry down the block.',
	parking: 'Has a car and nowhere to put it.',
	pets: 'The pet is non-negotiable.',
	street_noise: 'Sleeps badly with street noise.'
};
const EXTRA_FIELDS: PrefField[] = [
	'commute', 'laundry', 'street_noise', 'neighborhood', 'layout', 'floor', 'parking', 'available', 'sqft'
];

type Ctx = { bedrooms: number; budget: number; dest: Destination; commuteMax: number; pet: 'cats' | 'dogs' | null };

const round = (x: number, step: number) => Math.round(x / step) * step;
const BUDGET: [number, number][] = [
	[2200, 3000],
	[2800, 3800],
	[3800, 5500],
	[5000, 7500]
];

function isoDay(r: Rng): string {
	// Move-in dates between 2026-11-01 and 2027-02-28.
	const d = new Date(Date.UTC(2026, 10, 1) + int(r, 0, 119) * 86_400_000);
	return d.toISOString().slice(0, 10);
}

function sample<T>(r: Rng, xs: readonly T[], lo: number, hi: number): T[] {
	return shuffle(r, xs).slice(0, int(r, lo, hi));
}

/** A fresh, valid preference for `field`, consistent with the persona's context. */
function prefFor(r: Rng, field: PrefField, ctx: Ctx, weight: number, dealbreaker = false): Pref {
	switch (field) {
		case 'price':
			return { field, op: 'max', value: dealbreaker ? ctx.budget + round(int(r, 150, 600), 50) : ctx.budget, weight };
		case 'bedrooms':
			return { field, op: 'min', value: ctx.bedrooms, weight };
		case 'sqft':
			return { field, op: 'min', value: round(350 + ctx.bedrooms * 250 + int(r, 0, 150), 25), weight };
		case 'available':
			return { field, op: pick(r, ['max', 'min'] as const), value: isoDay(r), weight };
		case 'floor':
			return pick(r, [0, 1]) ? { field, op: 'min', value: 2, weight } : { field, op: 'max', value: int(r, 2, 3), weight };
		case 'layout':
			return pick(r, [0, 1])
				? { field, op: 'not_in', value: sample(r, ['railroad', 'irregular', 'loft'], 1, 2), weight }
				: { field, op: 'in', value: sample(r, ['standard', 'open', 'loft'], 1, 2), weight };
		case 'laundry':
			return { field, op: 'in', value: pick(r, [['in_unit'], ['in_unit', 'in_building']]), weight };
		case 'parking':
			return { field, op: 'eq', value: true, weight };
		case 'pets':
			return { field, op: 'in', value: [ctx.pet ?? 'cats', 'both'], weight };
		case 'street_noise':
			return { field, op: 'in', value: pick(r, [['quiet'], ['quiet', 'moderate'], ['moderate', 'lively']]), weight };
		case 'neighborhood':
			return pick(r, [0, 1])
				? { field, op: 'in', value: sample(r, NEIGHBORHOODS, 2, 4), weight }
				: { field, op: 'not_in', value: sample(r, NEIGHBORHOODS, 1, 3), weight };
		case 'commute':
			return { field, op: 'max', value: ctx.commuteMax + (dealbreaker ? 15 : 0), dest: ctx.dest, weight };
	}
}

/** Generated persona number k (gen_000, gen_001, ...). Stable for a given seed and template list. */
function generateOne(k: number, seed: number, templates: Persona[]): Persona {
	const r = rngFor(seed, `persona:${k}`);
	const template = templates.length ? pick(r, templates) : undefined;
	const bedrooms = pick(r, [0, 1, 1, 1, 2, 2, 3]);
	const [lo, hi] = BUDGET[bedrooms];
	// Most renters work in the city; a few go down to the Peninsula.
	const dest = pick(r, ['fidi', 'fidi', 'soma', 'soma', 'mission_bay', 'palo_alto'] as const);
	const ctx: Ctx = {
		bedrooms,
		budget: round(int(r, lo, hi), 50),
		dest,
		commuteMax: dest === 'palo_alto' ? round(int(r, 50, 80), 5) : round(int(r, 20, 45), 5),
		pet: pick(r, [null, null, 'cats', 'dogs'] as const)
	};

	// Fields from the template, then price/bedrooms, padded to 3-6 distinct fields.
	const fields: PrefField[] = [];
	const add = (f: PrefField) => {
		if ((f === 'pets' && !ctx.pet) || (f === 'bedrooms' && ctx.bedrooms === 0)) return;
		if (!fields.includes(f) && fields.length < 6) fields.push(f);
	};
	for (const h of template?.hidden ?? []) add(h.field);
	add('price');
	if (ctx.pet) add('pets');
	if (bedrooms > 0) add('bedrooms');
	const want = int(r, 3, 6);
	for (const f of shuffle(r, EXTRA_FIELDS)) if (fields.length < want) add(f);
	const hidden = shuffle(r, fields).map((f) => prefFor(r, f, ctx, int(r, 0, 3)));
	// Make sure at least one preference really matters.
	if (!hidden.some((h) => h.weight >= 2)) hidden[0].weight = 3;

	const dbField = template?.dealbreaker.field ?? pick(r, ['price', 'commute', 'pets', 'bedrooms'] as const);
	const usable = (dbField === 'pets' && !ctx.pet) || (dbField === 'bedrooms' && bedrooms === 0) ? 'price' : dbField;
	const dealbreaker = { ...prefFor(r, usable, ctx, 3, true), hard: true };

	const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
	const top = [...hidden].sort((a, b) => b.weight - a.weight)[0];
	const petBit = ctx.pet ? ` with ${ctx.pet === 'dogs' ? 'a dog' : 'a cat'}` : '';
	const blurb =
		`${name.split(' ')[0]} is ${pick(r, JOBS)} ${DEST_PHRASE[ctx.dest]}, looking for ${BED_PHRASE[bedrooms]}${petBit}. ` +
		(CARE_PHRASE[top.field] ?? 'Open to most things.');

	return {
		id: `${GEN_PREFIX}${String(k).padStart(3, '0')}`,
		name,
		blurb,
		behavior: pick(r, BEHAVIORS),
		hidden,
		dealbreaker
	};
}

/**
 * n personas: the seeds first (in order), then generated ones (gen_000, gen_001, ...).
 * Deterministic in (n, seed, seeds); generated persona k doesn't depend on n.
 */
export function generatePersonas(n: number, seed: number, seeds: Persona[]): Persona[] {
	const out = seeds.slice(0, n);
	for (let k = 0; out.length < n; k++) out.push(generateOne(k, seed, seeds));
	return out;
}

/**
 * Disjoint train / acceptance / held-out sets, sized from cfg.
 * Held-out is the first `heldout_size` generated personas (by id), never a seed, and doesn't change
 * when the pool grows. Train and acceptance are a seeded shuffle of the seeds plus the remaining
 * generated personas. Generates more personas if `all` is too small.
 */
export function splitPersonas(
	cfg: EvalConfig,
	all: Persona[]
): { train: Persona[]; acceptance: Persona[]; heldout: Persona[] } {
	const seeds = all.filter((p) => !isGenerated(p));
	const generated = all.filter(isGenerated).sort((a, b) => a.id.localeCompare(b.id));
	const needGen = cfg.heldout_size + Math.max(0, cfg.train_batch_size + cfg.acceptance_batch_size - seeds.length);
	const ids = new Set(all.map((p) => p.id));
	for (let k = 0; generated.length < needGen; k++) {
		const p = generateOne(k, cfg.seed, seeds);
		if (!ids.has(p.id)) {
			ids.add(p.id);
			generated.push(p);
		}
	}
	generated.sort((a, b) => a.id.localeCompare(b.id));
	const heldout = generated.slice(0, cfg.heldout_size);
	const pool = shuffle(rngFor(cfg.seed, 'split'), [...seeds, ...generated.slice(cfg.heldout_size)]);
	const train = pool.slice(0, cfg.train_batch_size);
	const acceptance = pool.slice(cfg.train_batch_size, cfg.train_batch_size + cfg.acceptance_batch_size);
	return { train, acceptance, heldout };
}
