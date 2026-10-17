// Listings: a seeded synthetic San Francisco generator (complete attributes, reproducible, offline)
// plus the You.com cache when present.
import type { Destination, EvalConfig, Listing } from './types.ts';
import { DESTINATIONS, NEIGHBORHOODS } from './types.ts';
import { chance, int, pick, rngFor, type Rng } from './rng.ts';

type Hood = {
	/** Rent multiplier vs. the city average. */
	rent: number;
	/** Transit minutes to fidi, soma, mission_bay, palo_alto (Caltrain). */
	commute: [number, number, number, number];
	noise: Array<'quiet' | 'moderate' | 'lively'>;
	parking: number;
	maxFloor: number;
};

const HOODS: Record<(typeof NEIGHBORHOODS)[number], Hood> = {
	Mission: { rent: 1.0, commute: [20, 15, 18, 60], noise: ['lively', 'lively', 'moderate'], parking: 0.2, maxFloor: 4 },
	SoMa: { rent: 1.1, commute: [12, 6, 10, 50], noise: ['lively', 'moderate'], parking: 0.4, maxFloor: 22 },
	'Hayes Valley': { rent: 1.12, commute: [15, 12, 20, 60], noise: ['moderate', 'lively'], parking: 0.2, maxFloor: 6 },
	'Nob Hill': { rent: 1.05, commute: [10, 15, 25, 65], noise: ['moderate', 'quiet'], parking: 0.25, maxFloor: 14 },
	'Pacific Heights': { rent: 1.25, commute: [20, 25, 30, 70], noise: ['quiet'], parking: 0.4, maxFloor: 8 },
	Marina: { rent: 1.2, commute: [25, 30, 35, 75], noise: ['moderate', 'lively'], parking: 0.35, maxFloor: 4 },
	'Inner Sunset': { rent: 0.95, commute: [35, 30, 30, 70], noise: ['quiet', 'moderate'], parking: 0.4, maxFloor: 4 },
	'Outer Sunset': { rent: 0.85, commute: [50, 45, 45, 75], noise: ['quiet'], parking: 0.6, maxFloor: 3 },
	'Inner Richmond': { rent: 0.92, commute: [30, 35, 40, 75], noise: ['quiet', 'moderate'], parking: 0.45, maxFloor: 4 },
	'Outer Richmond': { rent: 0.85, commute: [45, 50, 50, 80], noise: ['quiet'], parking: 0.6, maxFloor: 3 },
	'Noe Valley': { rent: 1.1, commute: [30, 25, 25, 55], noise: ['quiet'], parking: 0.45, maxFloor: 3 },
	Castro: { rent: 1.05, commute: [22, 18, 25, 60], noise: ['moderate', 'lively'], parking: 0.3, maxFloor: 4 },
	'Bernal Heights': { rent: 0.95, commute: [30, 25, 20, 50], noise: ['quiet', 'moderate'], parking: 0.5, maxFloor: 3 },
	'Potrero Hill': { rent: 1.05, commute: [20, 15, 10, 45], noise: ['quiet', 'moderate'], parking: 0.5, maxFloor: 4 },
	Dogpatch: { rent: 1.05, commute: [22, 15, 8, 40], noise: ['moderate'], parking: 0.45, maxFloor: 8 },
	Tenderloin: { rent: 0.75, commute: [10, 10, 20, 60], noise: ['lively'], parking: 0.1, maxFloor: 8 },
	'North Beach': { rent: 1.0, commute: [12, 18, 25, 65], noise: ['lively', 'moderate'], parking: 0.2, maxFloor: 5 },
	'Russian Hill': { rent: 1.15, commute: [15, 20, 30, 70], noise: ['quiet', 'moderate'], parking: 0.3, maxFloor: 10 },
	'Lower Haight': { rent: 0.98, commute: [20, 18, 25, 60], noise: ['moderate', 'lively'], parking: 0.25, maxFloor: 4 },
	Excelsior: { rent: 0.8, commute: [40, 35, 30, 45], noise: ['quiet', 'moderate'], parking: 0.6, maxFloor: 3 }
};

/** Typical transit minutes from a neighborhood to each destination. */
export function estimateCommute(neighborhood: string): Record<Destination, number> {
	const hood = HOODS[neighborhood as keyof typeof HOODS];
	const minutes = hood?.commute ?? [30, 30, 30, 65];
	return Object.fromEntries(DESTINATIONS.map((d, i) => [d, minutes[i]])) as Record<Destination, number>;
}

const BASE_RENT = [2400, 3200, 4400, 5800];
const SQFT: Array<[number, number]> = [
	[350, 550],
	[550, 800],
	[800, 1150],
	[1100, 1500]
];

function layoutFor(r: Rng, hood: string): Listing['layout'] {
	const victorian = ['Mission', 'Lower Haight', 'Castro', 'Noe Valley', 'Inner Richmond'].includes(hood);
	const industrial = ['SoMa', 'Dogpatch', 'Potrero Hill'].includes(hood);
	const x = r();
	if (industrial && x < 0.3) return 'loft';
	if (victorian && x < 0.25) return 'railroad';
	if (x < 0.55) return 'standard';
	if (x < 0.75) return 'open';
	if (x < 0.88) return 'irregular';
	return victorian ? 'railroad' : 'loft';
}

export function generateListings(count: number, seed: number): Listing[] {
	const r = rngFor(seed, 'listings');
	const hoods = Object.keys(HOODS) as Array<keyof typeof HOODS>;
	const out: Listing[] = [];
	for (let i = 0; i < count; i++) {
		const neighborhood = pick(r, hoods);
		const h = HOODS[neighborhood];
		const bedrooms = pick(r, [0, 0, 1, 1, 1, 1, 2, 2, 2, 3]);
		const layout = layoutFor(r, neighborhood);
		const laundry = pick(r, ['in_unit', 'in_unit', 'in_building', 'in_building', 'in_building', 'none', 'none'] as const);
		const parking = chance(r, h.parking);
		const floor = int(r, 1, Math.min(h.maxFloor, bedrooms === 0 ? h.maxFloor : h.maxFloor));
		const [lo, hi] = SQFT[bedrooms];
		const sqft = Math.round(int(r, lo, hi) / 10) * 10;
		let price = BASE_RENT[bedrooms] * h.rent * (0.88 + r() * 0.24);
		if (laundry === 'in_unit') price += 150;
		if (parking) price += 200;
		if (floor >= 8) price += 150;
		price = Math.round(price / 25) * 25;
		const day = new Date(Date.UTC(2026, 10, 1) + int(r, 0, 100) * 86_400_000);
		const commute = estimateCommute(neighborhood);
		for (const d of DESTINATIONS) commute[d] = Math.max(5, commute[d] + int(r, -5, 6));
		const kind = bedrooms === 0 ? 'Studio' : `${bedrooms}BR`;
		out.push({
			id: `syn_${String(i).padStart(3, '0')}`,
			source: 'synthetic',
			title: `${kind} ${layout === 'standard' ? '' : layout + ' '}in ${neighborhood}`,
			neighborhood,
			price,
			bedrooms,
			bathrooms: bedrooms <= 1 ? 1 : bedrooms === 2 ? pick(r, [1, 2]) : 2,
			sqft,
			floor,
			layout,
			laundry,
			parking,
			pets: pick(r, ['both', 'both', 'cats', 'cats', 'dogs', 'none', 'none'] as const),
			street_noise: pick(r, h.noise),
			available: day.toISOString().slice(0, 10),
			commute
		});
	}
	return out;
}

export async function loadListings(cfg: EvalConfig): Promise<Listing[]> {
	const { source, count } = cfg.listings;
	const synthetic = source === 'youcom' ? [] : generateListings(count, cfg.seed);
	if (source === 'synthetic') return synthetic;
	const { readYoucomCache } = await import('./sources/youcom.ts');
	const real = readYoucomCache();
	if (!real?.length) {
		if (source === 'youcom') throw new Error('No You.com listings cached; run `npm run listings -- --source youcom` first');
		console.warn('No You.com cache yet; using synthetic listings only');
		return synthetic;
	}
	return [...synthetic, ...real];
}

export function describeListing(l: Listing): string {
	const parts = [
		`$${l.price.toLocaleString('en-US')}/mo`,
		l.bedrooms === 0 ? 'studio' : `${l.bedrooms}BR`,
		l.neighborhood,
		l.floor != null ? `floor ${l.floor}` : null,
		l.layout,
		l.laundry && `laundry ${l.laundry.replace('_', ' ')}`,
		l.parking ? 'parking' : l.parking === false ? 'no parking' : null,
		l.pets && `pets: ${l.pets}`,
		l.street_noise && `${l.street_noise} street`,
		l.available && `avail ${l.available}`,
		`commute fidi ${l.commute.fidi ?? '?'}m / palo_alto ${l.commute.palo_alto ?? '?'}m`
	];
	return parts.filter(Boolean).join(' · ');
}
