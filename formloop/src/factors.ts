// Grounding new factors: when a renter asks for something no listing attribute covers ("near the 14 bus",
// "walking distance to a dog park", "away from freeway noise"), search You.com and have a cheap model turn
// the cited results into something the matcher can check: a set of our SF neighborhoods, or a rule on an
// existing attribute. Low confidence or no support in the sources = unresolved, and the matcher ignores it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pref } from './types.ts';
import { DESTINATIONS, NEIGHBORHOODS } from './types.ts';
import { formloopDir } from './config.ts';
import { chatJSON, hasCrusoeKey } from './crusoe.ts';
import { ydcSearch, type YdcResult } from './ydc.ts';

export type Resolution = {
	factor: string;
	status: 'resolved' | 'unresolved';
	kind?: 'neighborhoods' | 'rule';
	neighborhoods?: string[];
	rule?: Pref;
	confidence: number;
	sources: string[];
	rationale?: string;
	/** Why it is unresolved, e.g. "not cached" in cache-only runs. */
	reason?: string;
};

const MIN_CONFIDENCE = 0.6;
const resolutionDir = join(formloopDir, 'cache', 'factors');
const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
const fileFor = (factor: string) => join(resolutionDir, `${createHash('sha1').update(norm(factor)).digest('hex').slice(0, 16)}.json`);

/** Phrases that point at something outside the listing attributes. Used offline; online the extractor names them. */
export function findFactorsOffline(text: string): string[] {
	const out: string[] = [];
	const re = /\b(near|close to|walking distance (?:to|from)|walk to|away from|next to|far from|by)\s+(?:the\s+|a\s+|an\s+)?([^,.;]{3,40})/gi;
	for (const m of text.matchAll(re)) {
		const target = m[2].trim();
		if (/\b(bus|muni line|bart|train|park|freeway|highway|school|gym|grocery|trader joe|whole foods|beach|trail|cafe|coffee|hospital|playground|library|bars?|nightlife)\b/i.test(target)) out.push(`${m[1].toLowerCase()} ${target}`);
	}
	return [...new Set(out)];
}

function prompt(factor: string, results: YdcResult[]) {
	const system = [
		'Reasoning: low',
		'A San Francisco renter stated a requirement our listings have no field for. Using ONLY the numbered web results, map it to something checkable:',
		`(a) "neighborhoods": the subset of these neighborhoods where the results show the requirement is met: ${NEIGHBORHOODS.join(', ')}`,
		`(b) "rule": one preference on an existing listing field, as {"field", "op", "value"} with field one of street_noise (in [quiet,moderate,lively]), laundry, parking (eq true), pets (in [dogs,cats]), floor (min/max), or commute (op max minutes, "dest" one of ${DESTINATIONS.join('|')})`,
		'(c) "unresolved" if the results do not clearly support a mapping. Never invent one, and never use general knowledge the results do not state.',
		'Reply with JSON only: {"kind": "neighborhoods"|"rule"|"unresolved", "neighborhoods": [...], "rule": {...}, "confidence": 0-1, "cited": [result numbers you relied on], "rationale": "under 20 words"}'
	].join('\n');
	const user = `Requirement: "${factor}"\n\n` + results.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.description}\n${r.snippets.join(' ')}`).join('\n\n');
	return { system, user };
}

export async function resolveFactor(factor: string, opts: { cacheOnly?: boolean } = {}): Promise<Resolution> {
	const file = fileFor(factor);
	if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Resolution;
	const unresolved = (reason: string, sources: string[] = []): Resolution => ({ factor, status: 'unresolved', confidence: 0, sources, reason });
	const results = await ydcSearch(`${factor} San Francisco neighborhoods`, { count: 5, cacheOnly: opts.cacheOnly });
	if (results === null) return unresolved(opts.cacheOnly ? 'not cached' : 'no You.com key'); // not cached, so not saved either
	let res: Resolution;
	if (!results.length) res = unresolved('no search results');
	else if (opts.cacheOnly || !hasCrusoeKey()) return unresolved('no model available');
	else {
		const { system, user } = prompt(factor, results);
		const { data } = await chatJSON<{ kind?: string; neighborhoods?: unknown[]; rule?: Record<string, unknown>; confidence?: number; cited?: number[]; rationale?: string }>('normalizer', system, user, { maxTokens: 800 });
		const sources = [...new Set((data.cited ?? []).map((n) => results[Number(n) - 1]?.url).filter(Boolean) as string[])];
		const confidence = Math.max(0, Math.min(1, Number(data.confidence ?? 0)));
		const hoods = (data.neighborhoods ?? []).map((h) => NEIGHBORHOODS.find((n) => n.toLowerCase() === String(h).toLowerCase())).filter(Boolean) as string[];
		if (!sources.length) res = unresolved('model cited no sources');
		else if (confidence < MIN_CONFIDENCE) res = { ...unresolved(`low confidence (${confidence})`, sources), confidence };
		else if (data.kind === 'neighborhoods' && hoods.length && hoods.length < NEIGHBORHOODS.length)
			res = { factor, status: 'resolved', kind: 'neighborhoods', neighborhoods: [...new Set(hoods)], confidence, sources, rationale: data.rationale };
		else if (data.kind === 'rule' && data.rule) {
			const { cleanPref } = await import('./agent.ts');
			const rule = cleanPref({ ...data.rule, weight: 1 }, new Set());
			res = rule ? { factor, status: 'resolved', kind: 'rule', rule, confidence, sources, rationale: data.rationale } : unresolved('rule did not fit a listing field', sources);
		} else res = unresolved('nothing in the sources maps to a listing field', sources);
	}
	mkdirSync(resolutionDir, { recursive: true });
	writeFileSync(file, JSON.stringify(res, null, 2));
	return res;
}

/** The matcher-facing preference for a resolved factor, at the renter's revealed weight. */
export function factorPref(r: Resolution, weight: number, from?: string): Pref | null {
	if (r.status !== 'resolved') return null;
	const factor = { text: r.factor, sources: r.sources, confidence: r.confidence };
	if (r.kind === 'neighborhoods' && r.neighborhoods?.length) return { field: 'neighborhood', op: 'in', value: r.neighborhoods, weight, ...(from ? { from } : {}), factor };
	if (r.kind === 'rule' && r.rule) return { ...r.rule, weight, ...(from ? { from } : {}), factor };
	return null;
}
