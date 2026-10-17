// Merges research/neighborhoods.yaml, research/market.yaml and research/rent_calibration.yaml into one
// object per area for the UI. Rents come from rent_calibration.yaml (kind 'sourced') when present,
// otherwise from market.yaml (kind 'simulated'). Throws one Error listing every problem found.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { researchDir } from './research.ts';

export type Kind = 'sourced' | 'simulated';
export type Valued = { value: number; kind: Kind };
export type Area = {
	id: string;
	name: string;
	region: string;
	center: [number, number];
	tags: string[];
	profile: string;
	commute: { fidi: number; mission: number; soma: number; palo_alto: number; kind: 'simulated' };
	units: { value: number; kind: 'simulated' };
	vacancy_pct: { value: number; kind: 'simulated' };
	pipeline: { value: number; kind: 'simulated' };
	rent: { studio: Valued; one_br: Valued; two_br: Valued };
	yoy_pct: Valued;
	sources: string[];
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const RENTS = ['studio', 'one_br', 'two_br'] as const;
const COMMUTES = ['fidi', 'mission', 'soma', 'palo_alto'] as const;

function read(file: string, optional = false): Obj {
	const path = join(researchDir, file);
	if (!existsSync(path)) {
		if (optional) return {};
		throw new Error(`research/${file}: file not found`);
	}
	const doc: unknown = parse(readFileSync(path, 'utf8'));
	if (!isObj(doc)) throw new Error(`research/${file}: expected a mapping at the top level`);
	return doc;
}

export function loadAreas(): Area[] {
	const problems: string[] = [];
	const hood = read('neighborhoods.yaml');
	const market = read('market.yaml');
	const calib = read('rent_calibration.yaml', true);
	const list = Array.isArray(hood.areas) ? hood.areas : [];
	if (!list.length) problems.push('research/neighborhoods.yaml: `areas:` must be a non-empty list');
	const mAreas = isObj(market.areas) ? market.areas : {};
	if (!isObj(market.areas)) problems.push('research/market.yaml: `areas:` must be a map keyed by area id');
	const cAreas = isObj(calib.areas) ? calib.areas : {};

	const out: Area[] = [];
	list.forEach((raw: unknown, i: number) => {
		const p = (file: string, msg: string) => problems.push(`research/${file}: area ${where}: ${msg}`);
		const a = isObj(raw) ? raw : {};
		const id = typeof a.id === 'string' && a.id.trim() ? a.id : '';
		const where = id ? `"${id}"` : `#${i + 1}`;
		if (!id) p('neighborhoods.yaml', 'missing id');
		if (typeof a.name !== 'string' || !a.name.trim()) p('neighborhoods.yaml', 'missing name');
		const center = a.center;
		if (!Array.isArray(center) || center.length !== 2 || !center.every(isNum))
			p('neighborhoods.yaml', 'center must be [lat, lng] numbers');
		const cm = isObj(a.commute_min) ? a.commute_min : {};
		for (const k of COMMUTES) if (!isNum(cm[k])) p('neighborhoods.yaml', `commute_min.${k} must be a number`);

		const m = isObj(mAreas[id]) ? (mAreas[id] as Obj) : undefined;
		if (!m) p('market.yaml', 'no entry for this id');
		const mr = isObj(m?.median_rent) ? (m.median_rent as Obj) : {};
		for (const k of ['available_units', 'vacancy_pct', 'pipeline_units', 'yoy_pct'])
			if (m && !isNum(m[k])) p('market.yaml', `${k} must be a number`);
		for (const k of RENTS) if (m && !isNum(mr[k])) p('market.yaml', `median_rent.${k} must be a number`);

		const c = isObj(cAreas[id]) ? (cAreas[id] as Obj) : {};
		for (const k of [...RENTS, 'yoy_pct'])
			if (c[k] !== undefined && c[k] !== null && !isNum(c[k])) p('rent_calibration.yaml', `${k} must be a number`);
		const sources = Array.isArray(c.sources) ? c.sources.filter((s): s is string => typeof s === 'string') : [];
		const pick = (k: string, fallback: unknown): Valued =>
			isNum(c[k]) && sources.length ? { value: c[k], kind: 'sourced' } : { value: fallback as number, kind: 'simulated' };

		out.push({
			id,
			name: String(a.name ?? ''),
			region: String(a.region ?? ''),
			center: (Array.isArray(center) ? center : [0, 0]) as [number, number],
			tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
			profile: String(a.profile ?? ''),
			commute: {
				fidi: cm.fidi as number,
				mission: cm.mission as number,
				soma: cm.soma as number,
				palo_alto: cm.palo_alto as number,
				kind: 'simulated'
			},
			units: { value: m?.available_units as number, kind: 'simulated' },
			vacancy_pct: { value: m?.vacancy_pct as number, kind: 'simulated' },
			pipeline: { value: m?.pipeline_units as number, kind: 'simulated' },
			rent: { studio: pick('studio', mr.studio), one_br: pick('one_br', mr.one_br), two_br: pick('two_br', mr.two_br) },
			yoy_pct: pick('yoy_pct', m?.yoy_pct),
			sources
		});
	});
	if (problems.length) throw new Error(`research areas invalid:\n  ${problems.join('\n  ')}`);
	return out;
}
