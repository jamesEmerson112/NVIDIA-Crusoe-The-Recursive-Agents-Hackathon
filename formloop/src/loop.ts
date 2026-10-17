// The inner loop for one renter: fill the form, extract preferences, recommend, react, re-rank, score.
import type { Answer, EvalConfig, Form, Listing, Persona, Pref } from './types.ts';
import { answerOffline, answerOnline, quality, react, type Reaction } from './simulator.ts';
import { extractPrefs, prefFromReaction } from './agent.ts';
import { rank } from './utility.ts';

export type QuestionStat = {
	id: string;
	action: Answer['action'];
	rewritten_text?: string;
	seconds: number;
	friction: number;
	/** Match quality with this answer minus quality without it (ablation). */
	delta: number;
	/** delta - friction_weight * friction */
	value: number;
};

export type RenterResult = {
	persona: string;
	behavior: Persona['behavior'];
	form: number;
	answers: Answer[];
	prefs: Pref[];
	firstPick: Listing;
	rounds: { shown: Listing[]; reactions: Reaction[]; added: Pref[] }[];
	final: Listing;
	quality: number;
	friction: number;
	objective: number;
	questions: QuestionStat[];
};

export function frictionOf(a: Answer, cfg: EvalConfig): number {
	return (
		(a.action === 'skip' ? cfg.friction.skip : 0) +
		(a.action === 'rewrite' ? cfg.friction.rewrite : 0) +
		(a.seconds ?? 0) * cfg.friction.per_second
	);
}

export async function runRenter(
	persona: Persona,
	form: Form,
	listings: Listing[],
	cfg: EvalConfig,
	opts: { offline: boolean; log?: (line: string) => void; llmReactions?: boolean }
): Promise<RenterResult> {
	const log = opts.log ?? (() => {});
	const questions = form.questions.slice(0, cfg.questions_shown);
	const answers = opts.offline ? answerOffline(persona, questions, cfg.seed) : await answerOnline(persona, questions, cfg.seed);
	for (const a of answers) {
		const q = questions.find((x) => x.id === a.question_id)!;
		const shown = a.action === 'rewrite' ? `rewrote "${q.text}" -> "${a.rewritten_text}"` : q.text;
		log(`  ${a.action.padEnd(7)} ${shown}${a.value !== undefined ? `  =>  ${a.value}` : ''}${a.importance !== undefined ? `  [importance ${a.importance}]` : ''}`);
	}

	const prefs = await extractPrefs(questions, answers, opts);
	log(`  agent extracted ${prefs.length} preferences: ${prefs.map((p) => `${p.field}${p.dest ? `:${p.dest}` : ''} ${p.op} ${JSON.stringify(p.value)} w${p.weight}${p.hard ? ' hard' : ''}`).join('; ')}`);

	const firstPick = rank(listings, prefs)[0];
	const firstQuality = quality(persona, firstPick, listings);

	// Like/pass rounds: passed listings drop out, each reason becomes a preference, then re-rank.
	const passed = new Set<string>();
	const live = [...prefs];
	const rounds: RenterResult['rounds'] = [];
	let final: Listing | undefined;
	for (let round = 0; round < cfg.rounds && !final; round++) {
		const shown = rank(listings, live, passed).slice(0, cfg.top_k);
		const reactions = shown.map((l) => react(persona, l, listings));
		const added: Pref[] = [];
		for (const [i, r] of reactions.entries()) {
			if (r.liked) {
				final ??= shown[i];
				continue;
			}
			passed.add(r.listing_id);
			// Batch runs read reasons with rules (they're generated from hidden prefs) to save credits.
			const p = r.reason ? await prefFromReaction(r.reason, shown[i], { offline: opts.offline || !opts.llmReactions }) : null;
			if (p) added.push(p);
		}
		live.push(...added);
		rounds.push({ shown, reactions, added });
		log(`  round ${round + 1}: ` + reactions.map((r) => `${r.listing_id} ${r.liked ? 'LIKE' : `pass (${r.reason})`}`).join(' | '));
	}
	final ??= rank(listings, live, passed)[0] ?? firstPick;
	const q = quality(persona, final, listings);

	// Question value: re-run the first match without each answer and see how much the pick gets worse.
	const questionsStats: QuestionStat[] = answers.map((a) => {
		const friction = frictionOf(a, cfg);
		let delta = 0;
		if (a.action !== 'skip' && prefs.some((p) => p.from === a.question_id)) {
			const without = rank(listings, prefs.filter((p) => p.from !== a.question_id))[0];
			delta = firstQuality - quality(persona, without, listings);
		}
		return {
			id: a.question_id,
			action: a.action,
			...(a.rewritten_text ? { rewritten_text: a.rewritten_text } : {}),
			seconds: a.seconds ?? 0,
			friction,
			delta,
			value: delta - cfg.friction_weight * friction
		};
	});
	const friction = questionsStats.reduce((s, x) => s + x.friction, 0);
	return {
		persona: persona.id,
		behavior: persona.behavior,
		form: form.version,
		answers,
		prefs,
		firstPick,
		rounds,
		final,
		quality: q,
		friction,
		objective: q - cfg.friction_weight * friction,
		questions: questionsStats
	};
}
