// Generates 3D plans for a spread of listings, runs James's validatePlan on each, prints a table,
// writes three sample plans to data/plans/, and exits 1 on any failure.
// Usage: node src/cli/plan3d-check.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listingPlan } from '../plan3d.ts';
import { generateListings } from '../listings.ts';
import { validatePlan } from '../../../frontend/src/lib/floorplan/validate.ts';
import { LAYOUTS } from '../types.ts';
import type { Listing } from '../types.ts';
import type { Plan } from '../../../frontend/src/lib/floorplan/types.ts';

const here = dirname(fileURLToPath(import.meta.url));

function base(id: string): Listing {
	return {
		id,
		source: 'synthetic',
		title: id,
		neighborhood: 'Mission',
		price: 3000,
		bedrooms: 1,
		bathrooms: 1,
		sqft: null,
		floor: 2,
		layout: 'standard',
		laundry: 'none',
		parking: null,
		pets: null,
		street_noise: null,
		available: null,
		commute: { fidi: null, soma: null, mission_bay: null, palo_alto: null }
	};
}

const cases: Listing[] = [];
for (const layout of LAYOUTS)
	for (const bedrooms of [0, 1, 2, 3, 4])
		for (const bathrooms of [1, 2])
			for (const laundry of ['in_unit', 'none'] as const)
				for (const sqft of [null, 380, 800, 1700])
					cases.push({ ...base(`${layout}-${bedrooms}b${bathrooms}-${laundry}-${sqft ?? 'def'}`), layout, bedrooms, bathrooms, laundry, sqft });
cases.push({ ...base('nulls'), layout: null, laundry: null, sqft: null });
cases.push(...generateListings(300, 7), ...generateListings(100, 42));

/** Extra check beyond validatePlan: collinear walls must not overlap (stacked walls). */
function stacked(plan: Plan): string[] {
	const out: string[] = [];
	const ws = plan.stories[0].walls;
	for (let i = 0; i < ws.length; i++)
		for (let j = i + 1; j < ws.length; j++) {
			const [a, b] = [ws[i], ws[j]];
			const dx = a.b[0] - a.a[0];
			const dy = a.b[1] - a.a[1];
			const len = Math.hypot(dx, dy);
			const d = [dx / len, dy / len];
			const n = [-d[1], d[0]];
			const offA = n[0] * a.a[0] + n[1] * a.a[1];
			const par = Math.abs(Math.abs((d[0] * (b.b[0] - b.a[0]) + d[1] * (b.b[1] - b.a[1])) / Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])) - 1) < 1e-6;
			if (!par || Math.abs(n[0] * b.a[0] + n[1] * b.a[1] - offA) > 1e-3) continue;
			const t = (p: number[]) => d[0] * p[0] + d[1] * p[1];
			const lo = Math.max(Math.min(t(a.a), t(a.b)), Math.min(t(b.a), t(b.b)));
			const hi = Math.min(Math.max(t(a.a), t(a.b)), Math.max(t(b.a), t(b.b)));
			if (hi - lo > 1e-3) out.push(`walls ${a.id} and ${b.id} overlap`);
		}
	return out;
}

let fails = 0;
const rows: string[] = [];
for (const l of cases) {
	let problems: string[];
	let plan: Plan | null = null;
	try {
		plan = listingPlan(l);
		problems = [...validatePlan(plan), ...stacked(plan)];
		const s = plan.stories[0];
		if (!s.openings.some((o) => o.id === 'entry')) problems.push('no entry door');
		if (!s.furniture.length) problems.push('no furniture');
	} catch (e) {
		problems = [`threw: ${(e as Error).message}`];
	}
	if (problems.length) fails++;
	const s = plan?.stories[0];
	rows.push(
		[
			problems.length ? 'FAIL' : 'ok  ',
			(l.layout ?? 'null').padEnd(9),
			`${l.bedrooms}bd/${l.bathrooms}ba`.padEnd(8),
			(l.laundry ?? 'null').padEnd(11),
			String(l.sqft ?? '-').padStart(5),
			`walls ${s?.walls.length ?? 0}`.padEnd(9),
			`open ${s?.openings.length ?? 0}`.padEnd(8),
			`rooms ${s?.rooms.length ?? 0}`.padEnd(9),
			`furn ${s?.furniture.length ?? 0}`.padEnd(8),
			l.id,
			problems.length ? '\n      ' + problems.slice(0, 6).join('\n      ') : ''
		].join(' ')
	);
}
const verbose = process.argv.includes('--all');
for (const r of rows) if (verbose || r.startsWith('FAIL')) console.log(r);
console.log(`\n${cases.length - fails}/${cases.length} plans pass validatePlan (+ no stacked walls, entry door, furniture)`);

const outDir = join(here, '../../data/plans');
mkdirSync(outDir, { recursive: true });
const samples: Array<[string, Listing]> = [
	['studio', { ...base('sample-studio'), bedrooms: 0, sqft: 480, laundry: 'in_unit', neighborhood: 'SoMa' }],
	['1br', { ...base('sample-1br'), bedrooms: 1, sqft: 680, layout: 'irregular', laundry: 'in_unit', neighborhood: 'Hayes Valley' }],
	['2br', { ...base('sample-2br'), bedrooms: 2, bathrooms: 2, sqft: 950, laundry: 'in_unit' }]
];
for (const [name, l] of samples) writeFileSync(join(outDir, `${name}.json`), JSON.stringify(listingPlan(l), null, 1) + '\n');
console.log(`wrote ${samples.map(([n]) => n + '.json').join(', ')} to ${outDir}`);
process.exit(fails ? 1 : 0);
