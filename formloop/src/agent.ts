// The recommender agent: turns answers, edited questions and importance weights into preferences,
// and turns a renter's "pass, because ..." into a new preference before re-ranking.
import type { Answer, Destination, Listing, Pref, Question } from './types.ts';
import { DESTINATIONS, LAYOUTS, LAUNDRY, NEIGHBORHOODS, NOISE, PETS, PREF_FIELDS, PREF_OPS } from './types.ts';
import { chatJSON } from './crusoe.ts';
import { parseField, parsePrefs } from './phrases.ts';

const ENUMS: Partial<Record<Pref['field'], readonly string[]>> = {
	neighborhood: NEIGHBORHOODS,
	layout: LAYOUTS,
	laundry: LAUNDRY,
	pets: PETS,
	street_noise: NOISE
};

/** Drop or repair anything a model produced that the matcher can't use. */
export function cleanPref(raw: unknown, questionIds: Set<string>): Pref | null {
	if (!raw || typeof raw !== 'object') return null;
	const p = raw as Record<string, unknown>;
	const field = p.field as Pref['field'];
	const op = p.op as Pref['op'];
	if (!PREF_FIELDS.includes(field) || !PREF_OPS.includes(op)) return null;
	let value = p.value as Pref['value'];
	const allowed = ENUMS[field];
	if (allowed) {
		const norm = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
		const vals = (Array.isArray(value) ? value : [value])
			.map((v) => allowed.find((a) => norm(a) === norm(String(v))))
			.filter(Boolean) as string[];
		if (!vals.length) return null;
		value = vals;
		if (op !== 'in' && op !== 'not_in') return null;
	} else if (field === 'parking') {
		value = value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes';
	} else if (field === 'available') {
		if (Number.isNaN(Date.parse(String(value)))) return null;
		value = String(value).slice(0, 10);
	} else {
		const n = Number(value);
		if (!Number.isFinite(n)) return null;
		value = n;
		// A destination without a time limit ("Mission Bay, I take the N") came back as "max 0 minutes".
		if (field === 'commute' && (n < 10 || n > 120)) value = 35;
		if (field === 'price' && n < 500) return null;
		if ((field === 'sqft' || field === 'bedrooms') && n < 0) return null;
	}
	// "In-building works" also accepts in-unit, which is strictly better.
	if (field === 'laundry' && op === 'in' && Array.isArray(value) && value.includes('in_building') && !value.includes('in_unit')) value = ['in_unit', ...value];
	const dest = p.dest as Destination | undefined;
	if (field === 'commute' && !DESTINATIONS.includes(dest as Destination)) return null;
	const from = typeof p.from === 'string' && questionIds.has(p.from) ? p.from : undefined;
	return {
		field,
		op,
		value,
		...(field === 'commute' ? { dest } : {}),
		weight: Math.max(0, Math.min(3, Number(p.weight ?? 1) || 1)),
		...(p.hard === true ? { hard: true } : {}),
		...(from ? { from } : {})
	};
}

const SCHEMA = `Pref = {"field": one of ${PREF_FIELDS.join('|')}, "op": max|min|in|not_in|eq, "value": number | ISO date | list | boolean, "dest": ${DESTINATIONS.join('|')} (commute only), "weight": 0-3, "hard": true only for dealbreakers, "from": the question_id it came from}
Rules: price max in USD/month; commute max minutes with dest (if no time is given, use 35); bedrooms min; floor min/max; available max = move-in-by date; pets in = pets the renter HAS (dogs, cats); laundry in [in_unit] or [in_unit,in_building]; parking eq true/false; street_noise in subset of [quiet,moderate,lively]; layout in/not_in subset of [${LAYOUTS.join(',')}]; neighborhood in/not_in subset of [${NEIGHBORHOODS.join(', ')}].`;

function questionText(q: Question, a: Answer) {
	return a.action === 'rewrite' && a.rewritten_text ? `${a.rewritten_text} (renter's rewrite of: ${q.text})` : q.text;
}

export async function extractPrefs(
	questions: Question[],
	answers: Answer[],
	opts: { offline: boolean }
): Promise<Pref[]> {
	const byId = new Map(questions.map((q) => [q.id, q]));
	const given = answers.filter((a) => a.action !== 'skip' && a.value !== undefined);
	if (!given.length) return [];
	const weightOf = (a: Answer) => a.importance ?? 1;

	if (opts.offline) {
		return given.flatMap((a) => {
			const q = byId.get(a.question_id);
			return q ? parsePrefs(q, String(a.value), weightOf(a)) : [];
		});
	}

	const system = `Reasoning: low\nYou turn a renter's intake-form answers into structured apartment preferences.\n${SCHEMA}\nOnly state what the answers support; a rewritten question tells you what the renter actually cares about. Reply with JSON only: {"prefs":[Pref,...]}`;
	const user = given
		.map((a) => {
			const q = byId.get(a.question_id)!;
			return `[${q.id}] Q: ${questionText(q, a)}\nA: ${Array.isArray(a.value) ? a.value.join(', ') : a.value} (importance ${weightOf(a)}/3)`;
		})
		.join('\n');
	const { data } = await chatJSON<{ prefs?: unknown[] }>('extractor', system, user);
	const ids = new Set(questions.map((q) => q.id));
	const importance = new Map(given.map((a) => [a.question_id, weightOf(a)]));
	return (data.prefs ?? [])
		.map((p) => cleanPref(p, ids))
		.filter((p): p is Pref => p !== null)
		// The slider is the renter's explicit weight; it beats the model's guess.
		.map((p) => (p.from && importance.has(p.from) ? { ...p, weight: importance.get(p.from)! } : p));
}

/** "Pass: too expensive" -> a preference that would have ruled this listing down. */
export async function prefFromReaction(reason: string, l: Listing, opts: { offline: boolean }): Promise<Pref | null> {
	const t = reason.toLowerCase();
	const from = 'reaction';
	if (opts.offline) {
		if (/expensive|price|afford/.test(t)) return { field: 'price', op: 'max', value: l.price - 150, weight: 2, from };
		if (/commute/.test(t)) {
			const p = parseField('commute', reason, 2, from);
			if (p?.dest) return { ...p, value: Math.max(5, (l.commute[p.dest] ?? 40) - 5) };
		}
		for (const f of ['laundry', 'street_noise', 'pets', 'neighborhood', 'layout', 'floor', 'bedrooms', 'parking'] as const) {
			const p = parseField(f, reason, 2, from);
			if (p) return p;
		}
		if (/not available|in time/.test(t) && l.available)
			return { field: 'available', op: 'max', value: new Date(Date.parse(l.available) - 86_400_000).toISOString().slice(0, 10), weight: 2, from };
		if (/too small/.test(t)) return { field: 'bedrooms', op: 'min', value: l.bedrooms + 1, weight: 2, from };
		return null;
	}
	const system = `Reasoning: low\nA renter passed on an apartment. Turn their reason into ONE preference that would rank listings like this lower.\n${SCHEMA}\nUse the listing's values to set thresholds. Reply with JSON only: {"pref": Pref or null}`;
	const user = `Listing: ${JSON.stringify({ ...l, url: undefined })}\nReason: ${reason}`;
	const { data } = await chatJSON<{ pref?: unknown }>('extractor', system, user, { maxTokens: 600 });
	const p = cleanPref(data.pref, new Set());
	return p ? { ...p, from } : null;
}
