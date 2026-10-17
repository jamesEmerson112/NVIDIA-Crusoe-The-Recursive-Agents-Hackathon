// npm run listings -- --source youcom|synthetic [--limit 60] [--seed 7] [--refresh]
// Prints a short table of listings plus how many of each optional field are null.
// `--source youcom` reads data/listings.youcom.json when it exists; `--refresh` re-queries You.com (spends credits).

import { parseArgs } from 'node:util';
import type { Listing } from '../types.ts';

const { values } = parseArgs({
	options: {
		source: { type: 'string', default: 'synthetic' },
		limit: { type: 'string', default: '60' },
		seed: { type: 'string', default: '7' },
		refresh: { type: 'boolean', default: false }
	}
});

const limit = Number(values.limit);
const seed = Number(values.seed);
if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(seed)) {
	console.error('--limit and --seed must be integers (limit >= 1)');
	process.exit(1);
}

let listings: Listing[];
try {
	if (values.source === 'youcom') {
		const { fetchYoucomListings } = await import('../sources/youcom.ts');
		listings = await fetchYoucomListings({ limit, seed, refresh: values.refresh });
	} else if (values.source === 'synthetic') {
		const mod = (await import('../listings.ts')) as { generateListings?: (count: number, seed: number) => Listing[] };
		if (typeof mod.generateListings !== 'function') {
			console.error('generateListings is not exported from src/listings.ts yet.');
			process.exit(1);
		}
		listings = mod.generateListings(limit, seed);
	} else {
		console.error(`Unknown --source "${values.source}". Use youcom or synthetic.`);
		process.exit(1);
	}
} catch (e) {
	console.error((e as Error).message);
	process.exit(1);
}

const host = (url?: string) => {
	if (!url) return '-';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '?';
	}
};

const rows = listings.map((l) => [
	l.id,
	l.neighborhood,
	l.bedrooms === 0 ? 'studio' : String(l.bedrooms),
	`$${l.price.toLocaleString('en-US')}`,
	l.laundry ?? '-',
	host(l.url)
]);
const header = ['id', 'neighborhood', 'beds', 'price', 'laundry', 'host'];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
console.log(line(header));
console.log(line(widths.map((w) => '-'.repeat(w))));
for (const r of rows) console.log(line(r));

const nullable = ['url', 'sqft', 'floor', 'layout', 'laundry', 'parking', 'pets', 'street_noise', 'available'] as const;
const nulls = nullable.map((k) => `${k} ${listings.filter((l) => l[k] == null).length}`);
const commuteNulls = listings.filter((l) => Object.values(l.commute ?? {}).some((v) => v == null)).length;
console.log(`\n${listings.length} listings (source ${values.source}, seed ${seed}${values.refresh ? ', refreshed' : ''})`);
console.log(`null counts: ${nulls.join(', ')}, commute ${commuteNulls}`);
