// Plain-English renderings of preferences, and the reverse parser. The offline renter simulator speaks
// in these phrases and the offline agent reads them, so the whole loop runs without an API key.
import type { Destination, Listing, Pref, PrefField, Question } from './types.ts';
import { DESTINATIONS, LAYOUTS, NEIGHBORHOODS } from './types.ts';

export const DEST_LABEL: Record<Destination, string> = {
	fidi: 'the Financial District',
	soma: 'an office in SoMa',
	mission_bay: 'Mission Bay (UCSF)',
	palo_alto: 'Palo Alto on Caltrain'
};

const DEST_WORDS: Record<Destination, RegExp> = {
	fidi: /financial|fidi|downtown|embarcadero|montgomery/i,
	soma: /soma|south of market|yerba|moscone/i,
	mission_bay: /mission bay|ucsf|chase center/i,
	palo_alto: /palo alto|peninsula|stanford|caltrain|south bay|mountain view/i
};

const list = (v: Pref['value']) => (Array.isArray(v) ? v.map(String) : [String(v)]);

/** How a renter would state this preference on a form. */
export function sayPref(p: Pref): string {
	const firm = p.hard || p.weight >= 2.5;
	switch (p.field) {
		case 'price':
			return firm ? `$${p.value} max, that's firm` : `around $${p.value}, a little flexible`;
		case 'commute':
			return `${DEST_LABEL[p.dest ?? 'fidi']} by transit, ideally under ${p.value} min`;
		case 'bedrooms':
			return Number(p.value) === 0 ? 'a studio is fine' : `${p.value} bedroom${Number(p.value) > 1 ? 's' : ''}`;
		case 'sqft':
			return `at least ${p.value} sq ft`;
		case 'available':
			return p.op === 'max' ? `move in by ${p.value}` : `not before ${p.value}`;
		case 'pets': {
			const pets = list(p.value).filter((x) => x !== 'none');
			if (!pets.length) return 'no pets';
			return pets.map((x) => (x === 'dogs' ? 'I have a dog' : x === 'cats' ? 'I have a cat' : `I have ${x}`)).join(' and ');
		}
		case 'laundry':
			return list(p.value).includes('in_building') ? 'laundry in the building is ok' : 'I need in-unit laundry';
		case 'parking':
			return p.value === true ? 'yes, I need parking' : "no, I don't need parking";
		case 'street_noise': {
			const v = list(p.value);
			if (p.op === 'not_in' && v.includes('lively')) return 'not too loud please';
			if (v.length === 1 && v[0] === 'quiet') return 'a quiet street please';
			if (v.includes('lively')) return 'I like a lively street';
			return 'not too loud please';
		}
		case 'floor':
			return p.op === 'min' ? `floor ${p.value} or higher` : `floor ${p.value} or lower`;
		case 'layout':
			return p.op === 'not_in' ? `no ${list(p.value).join(' or ')} layouts` : `prefer a ${list(p.value).join(' or ')} layout`;
		case 'neighborhood':
			return p.op === 'not_in' ? `never: ${list(p.value).join(', ')}` : `ideally ${list(p.value).join(' or ')}`;
	}
}

/** "The one thing you hated about your last place", in character. */
export function complainAbout(p: Pref): string {
	switch (p.field) {
		case 'street_noise':
			return 'it was so loud at night, I want a quiet street';
		case 'laundry':
			return 'no laundry in the unit';
		case 'layout':
			return p.op === 'not_in' ? `a ${list(p.value)[0]} layout` : 'the layout was awkward';
		case 'floor':
			return p.op === 'min' ? `ground floor, I want floor ${p.value} or higher` : `too many stairs, floor ${p.value} or lower`;
		case 'price':
			return `too expensive, I want $${p.value} max`;
		case 'commute':
			return `the commute to ${DEST_LABEL[p.dest ?? 'fidi']} was brutal, under ${p.value} min`;
		case 'parking':
			return 'no parking, I need parking';
		case 'pets':
			return sayPref(p) + ' and the landlord hated it';
		case 'sqft':
			return `way too small, at least ${p.value} sq ft`;
		default:
			return sayPref(p);
	}
}

/** Why a renter passes on a listing, phrased from the preference it misses most. */
export function passReason(p: Pref, l: Listing): string {
	switch (p.field) {
		case 'price':
			return `too expensive for me at $${l.price}`;
		case 'commute':
			return `the commute to ${DEST_LABEL[p.dest ?? 'fidi']} is too long`;
		case 'laundry':
			return 'I need in-unit laundry';
		case 'street_noise':
			return 'the street is too loud';
		case 'pets':
			return list(p.value).includes('dogs') ? "they don't allow my dog" : "they don't allow my cat";
		case 'neighborhood':
			return `not ${l.neighborhood}`;
		case 'floor':
			return p.op === 'min' ? 'the floor is too low' : 'too many stairs';
		case 'layout':
			return `I don't want a ${l.layout} layout`;
		case 'bedrooms':
			return `too small, I need ${p.value} bedroom${Number(p.value) > 1 ? 's' : ''}`;
		case 'available':
			return 'not available in time';
		case 'parking':
			return 'no parking';
		case 'sqft':
			return 'too small';
	}
}

const money = (t: string) => {
	const m = t.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?/i) ?? t.match(/\b(\d{4,5})\b/);
	if (!m) return null;
	const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
	return n >= 500 && n <= 20000 ? n : null;
};

const minutes = (t: string) => {
	const m = t.match(/(\d{1,3})\s*(?:min|minutes)/i);
	return m ? Number(m[1]) : null;
};

function findHoods(t: string): string[] {
	return NEIGHBORHOODS.filter((h) => new RegExp(`\\b${h.replace(/ /g, '\\s+')}\\b`, 'i').test(t));
}

/** Parse one field out of free text. Returns null when the text says nothing about it. */
export function parseField(field: PrefField, text: string, weight: number, from: string): Pref | null {
	const t = text.toLowerCase();
	const base = { weight, from };
	switch (field) {
		case 'price': {
			const n = money(text);
			if (n === null) return null;
			return { ...base, field, op: 'max', value: n, hard: /firm|max(imum)?\b|hard|absolutely/.test(t) && !/flexible/.test(t) };
		}
		case 'commute': {
			const dest = DESTINATIONS.find((d) => DEST_WORDS[d].test(text));
			if (!dest) return null;
			return { ...base, field, op: 'max', value: minutes(text) ?? 35, dest };
		}
		case 'bedrooms': {
			if (/studio/.test(t)) return { ...base, field, op: 'min', value: 0 };
			if (/^\s*\d\+?\s*$/.test(t)) return { ...base, field, op: 'min', value: parseInt(t, 10) };
			const m = t.match(/(\d)\s*(?:bed|br|bedroom)/) ?? t.match(/(\d)\s*(?:people|of us|person household)/);
			if (!m) return null;
			const n = /people|of us|household/.test(m[0]) ? Math.max(1, Number(m[1]) - 1) : Number(m[1]);
			return { ...base, field, op: 'min', value: n };
		}
		case 'sqft': {
			const m = t.match(/(\d{3,4})\s*(?:sq|square)/);
			return m ? { ...base, field, op: 'min', value: Number(m[1]) } : null;
		}
		case 'available': {
			const op = /not before|after|no earlier/.test(t) ? 'min' : 'max';
			const m = text.match(/\d{4}-\d{2}-\d{2}/);
			if (m) return { ...base, field, op, value: m[0] };
			const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
			const mm = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?/);
			if (!mm) return /asap|now|immediately|right away/.test(t) ? { ...base, field, op: 'max', value: '2026-11-15' } : null;
			const month = months.indexOf(mm[1]);
			const year = month >= 9 ? 2026 : 2027;
			const day = mm[2] ? Number(mm[2]) : /early|beginning|start/.test(t) ? 7 : /late|end/.test(t) ? 25 : 15;
			return { ...base, field, op, value: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
		}
		case 'pets': {
			const both = /^\s*both\s*$/.test(t);
			const pets = [(both || /\bdogs?\b|\bpupp/.test(t)) && 'dogs', (both || /\bcats?\b|kitten/.test(t)) && 'cats'].filter(Boolean) as string[];
			if (!pets.length) return null;
			return { ...base, field, op: 'in', value: pets };
		}
		case 'laundry': {
			if (/building/.test(t) && !/no laundry in the building/.test(t)) return { ...base, field, op: 'in', value: ['in_unit', 'in_building'] };
			if (/in[-_ ]?unit|washer|laundry in the unit/.test(t)) return { ...base, field, op: 'in', value: ['in_unit'] };
			return null;
		}
		case 'parking': {
			if (!/park|car|garage/.test(t) && !/^(yes|no)\b/.test(t)) return null;
			const no = /\bno\b|don'?t need|not needed|without/.test(t) && !/need parking/.test(t);
			return { ...base, field, op: 'eq', value: !no };
		}
		case 'street_noise': {
			if (/lively|buzz|nightlife|energy/.test(t) && !/not/.test(t)) return { ...base, field, op: 'in', value: ['lively', 'moderate'] };
			if (/^\s*moderate\s*$/.test(t)) return { ...base, field, op: 'not_in', value: ['lively'] };
			if (/quiet|loud|noise|noisy|sleep/.test(t)) {
				return /not too loud|moderate/.test(t)
					? { ...base, field, op: 'not_in', value: ['lively'] }
					: { ...base, field, op: 'in', value: ['quiet'] };
			}
			return null;
		}
		case 'floor': {
			const m = t.match(/floor\s*(\d+)\s*or\s*(higher|lower|above|below)/);
			if (m) return { ...base, field, op: /higher|above/.test(m[2]) ? 'min' : 'max', value: Number(m[1]) };
			if (/^\s*ground\s*$/.test(t)) return { ...base, field, op: 'max', value: 1 };
			if (/^\s*low\b/.test(t)) return { ...base, field, op: 'max', value: 3 };
			if (/^\s*high\b|high floor|top floor|views/.test(t)) return { ...base, field, op: 'min', value: 4 };
			if (/ground floor|first floor/.test(t)) return { ...base, field, op: 'min', value: 2 };
			if (/stairs|low floor/.test(t)) return { ...base, field, op: 'max', value: 2 };
			return null;
		}
		case 'layout': {
			const named = LAYOUTS.filter((x) => t.includes(x));
			if (!named.length) return null;
			const neg = /\bno\b|not|hate|never|awkward|a (railroad|loft|irregular|open) layout/.test(t) && !/prefer/.test(t);
			return { ...base, field, op: neg ? 'not_in' : 'in', value: named };
		}
		case 'neighborhood': {
			const hoods = findHoods(text);
			if (!hoods.length) return null;
			return { ...base, field, op: /never|not|avoid|no\b/.test(t) ? 'not_in' : 'in', value: hoods };
		}
	}
}

/** Offline agent: parse every field the question maps to. */
export function parsePrefs(q: Question, text: string, weight: number): Pref[] {
	const out: Pref[] = [];
	if (/^\s*(no preference|n\/a|none|whatever|don'?t care)\s*$/i.test(text)) return out;
	// "Which neighborhoods would you never consider?" answered with a plain list means not_in.
	const negative = /never|avoid|hate|rule out|deal ?breaker/i.test(q.text);
	for (const f of q.maps_to) {
		let p = parseField(f, text, weight, q.id);
		if (p && negative && (f === 'neighborhood' || f === 'layout') && p.op === 'in') p = { ...p, op: 'not_in' };
		if (p) out.push(p);
	}
	return out;
}
