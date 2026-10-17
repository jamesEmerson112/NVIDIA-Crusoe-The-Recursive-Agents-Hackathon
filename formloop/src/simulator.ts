// Simulated renters: fill the form in character, then react to recommended listings.
// Online they role-play with the cheap model; offline (or for skips_all) they follow fixed rules.
import type { Answer, Listing, Persona, Pref, Question } from './types.ts';
import { chatJSON } from './crusoe.ts';
import { complainAbout, passReason, sayPref } from './phrases.ts';
import { satisfaction, utility } from './utility.ts';
import { rngFor } from './rng.ts';

const BASE_SECONDS: Record<Question['type'], number> = { number: 6, select: 5, multiselect: 9, text: 15, yesno: 3 };

const BEHAVIOR_TEXT: Record<Persona['behavior'], string> = {
	answers_everything: 'You answer every question, carefully and specifically.',
	skips_money: 'You never answer questions about money or budget (skip them); you answer the rest.',
	rewrites_vague:
		'When a question is vague or does not fit your situation, you rewrite it in your own words (rewritten_text) and answer your version.',
	skips_all: 'You are in a hurry and skip every question.',
	terse: 'You answer in a few words and skip questions that do not matter much to you.'
};

const isMoney = (q: Question) => q.maps_to.includes('price') || /budget|rent|price|afford|\$/i.test(q.text);
const isVague = (q: Question) => q.type === 'text' || /thing|how|anything|vibe|feel/i.test(q.text);

const allPrefs = (p: Persona): Pref[] => [...p.hidden, { ...p.dealbreaker, hard: true, weight: 3 }];

/** The persona's strongest preference this question is about, if any. */
function relevant(q: Question, persona: Persona): Pref | undefined {
	return allPrefs(persona)
		.filter((p) => q.maps_to.includes(p.field))
		.sort((a, b) => b.weight - a.weight)[0];
}

export function answerOffline(persona: Persona, questions: Question[], seed: number): Answer[] {
	const r = rngFor(seed, `answers:${persona.id}`);
	return questions.map((q): Answer => {
		const seconds = Math.round(BASE_SECONDS[q.type] * (0.7 + r() * 0.8));
		const skip = (s = 2): Answer => ({ question_id: q.id, action: 'skip', seconds: s });
		if (persona.behavior === 'skips_all') return skip(1);
		if (persona.behavior === 'skips_money' && isMoney(q)) return skip();
		const p = relevant(q, persona);
		if (!p) return persona.behavior === 'answers_everything' ? { question_id: q.id, action: 'answer', value: 'no preference', importance: 0, seconds } : skip();
		if (persona.behavior === 'terse' && p.weight < 2) return skip();
		const value = /hate|last place|worst|annoy/i.test(q.text) ? complainAbout(p) : sayPref(p);
		const importance = Math.min(3, Math.round(p.weight));
		if (persona.behavior === 'rewrites_vague' && isVague(q)) {
			const rewritten = `What should I avoid on ${p.field.replace('_', ' ')}?`;
			return { question_id: q.id, action: 'rewrite', rewritten_text: rewritten, value, importance, seconds: seconds + 12 };
		}
		return { question_id: q.id, action: 'answer', value, importance, seconds };
	});
}

function describeHidden(persona: Persona): string {
	const weightWord = (w: number) => (w >= 2.5 ? 'very important' : w >= 1.5 ? 'important' : 'nice to have');
	return [
		...persona.hidden.map((p) => `- ${sayPref(p)} (${weightWord(p.weight)})`),
		`- ABSOLUTE DEALBREAKER: ${sayPref(persona.dealbreaker)}`
	].join('\n');
}

export async function answerOnline(persona: Persona, questions: Question[], seed: number): Promise<Answer[]> {
	if (persona.behavior === 'skips_all') return answerOffline(persona, questions, seed);
	const system = [
		`You role-play a San Francisco renter filling out an apartment search intake form. Stay in character.`,
		`Who you are: ${persona.name}. ${persona.blurb}`,
		`How you fill out forms: ${BEHAVIOR_TEXT[persona.behavior]}`,
		`What you actually want (private; answer like a real person, don't copy this list):\n${describeHidden(persona)}`,
		`Every question is optional. For each question choose action "answer", "skip" or "rewrite" (rewrite = you reword the question to fit you, then answer it).`,
		`importance is your 0-3 slider for how much that question matters to you. seconds is how long you'd spend on it.`,
		`Reply with JSON only: {"answers":[{"question_id":"...","action":"answer|skip|rewrite","value":"...","rewritten_text":"...","importance":0,"seconds":0}]}`
	].join('\n\n');
	const user = questions
		.map((q) => `${q.id} (${q.type}${q.options ? `: ${q.options.join(' | ')}` : ''}): ${q.text}`)
		.join('\n');
	const { data } = await chatJSON<{ answers?: Answer[] }>('simulator', system, user);
	const byId = new Map((data.answers ?? []).map((a) => [a.question_id, a]));
	return questions.map((q): Answer => {
		const a = byId.get(q.id);
		const action = a && ['answer', 'skip', 'rewrite'].includes(a.action) ? a.action : 'skip';
		const seconds = Number.isFinite(Number(a?.seconds)) && Number(a?.seconds) > 0 ? Number(a?.seconds) : BASE_SECONDS[q.type];
		if (action === 'skip' || a?.value === undefined || a.value === '') return { question_id: q.id, action: 'skip', seconds: Math.min(seconds, 3) };
		return {
			question_id: q.id,
			action,
			value: Array.isArray(a.value) ? a.value.map(String) : typeof a.value === 'number' ? a.value : String(a.value),
			rewritten_text: action === 'rewrite' ? String(a.rewritten_text ?? '') || undefined : undefined,
			importance: Math.max(0, Math.min(3, Math.round(Number(a.importance ?? 1)))),
			seconds
		};
	});
}

/** Hidden-utility percentile of a listing among all listings: 1 = the persona's best, 0 = worst or a dealbreaker. */
export function quality(persona: Persona, l: Listing, listings: Listing[]): number {
	const prefs = allPrefs(persona);
	const u = utility(l, prefs);
	if (u < 0) return 0;
	let below = 0;
	for (const other of listings) if (utility(other, prefs) < u) below++;
	return listings.length > 1 ? below / (listings.length - 1) : 1;
}

export type Reaction = { listing_id: string; liked: boolean; reason?: string };

/** The renter reacts to a shown listing from their hidden preferences (no model call: it's the ground truth). */
export function react(persona: Persona, l: Listing, listings: Listing[], likeAbove = 0.9): Reaction {
	const q = quality(persona, l, listings);
	if (q >= likeAbove) return { listing_id: l.id, liked: true };
	const worst = allPrefs(persona)
		.map((p) => ({ p, s: satisfaction(l, p) ?? 0.5 }))
		.filter((x) => x.s < 1)
		.sort((a, b) => (1 - b.s) * b.p.weight - (1 - a.s) * a.p.weight)[0];
	return { listing_id: l.id, liked: false, reason: worst ? passReason(worst.p, l) : 'just not feeling it' };
}
