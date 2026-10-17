// Follow-up questions written for one renter from what they revealed: how they ranked the questions,
// what they answered or skipped, and why they passed on listings.
import type { Answer, Question } from './types.ts';
import { PREF_FIELDS, QUESTION_TYPES } from './types.ts';
import { chatJSON } from './crusoe.ts';
import { checkQuestions } from './research.ts';

export type FollowUp = Question & { why: string };

type Input = {
	questions: Question[];
	answers: Answer[];
	/** Question ids, most important first. */
	ranking: string[];
	passes: string[];
	bank: Question[];
};

function describe({ questions, answers, ranking, passes }: Input): string {
	const byId = new Map(questions.map((q) => [q.id, q]));
	const ans = new Map(answers.map((a) => [a.question_id, a]));
	const lines = ranking
		.map((id, i) => {
			const q = byId.get(id);
			if (!q) return null;
			const a = ans.get(id);
			const text = a?.rewritten_text ?? q.text;
			const said = a && a.action !== 'skip' && a.value !== undefined ? `answered "${Array.isArray(a.value) ? a.value.join(', ') : a.value}"` : 'left blank';
			return `${i + 1}. ${text} -> ${said}${a?.rewritten_text ? ' (they reworded this question)' : ''}`;
		})
		.filter(Boolean);
	return [
		`What they answered, ordered by how much they revealed they care (detail and conviction; 1 = most):\n${lines.join('\n')}`,
		passes.length ? `They passed on listings because: ${passes.map((p) => `"${p}"`).join('; ')}` : 'No listings passed yet.'
	].join('\n\n');
}

export async function proposeFollowups(input: Input, opts: { offline: boolean }): Promise<FollowUp[]> {
	const asked = new Set(input.questions.map((q) => q.id));
	if (!opts.offline) {
		const system = [
			'Reasoning: low',
			'You write the next 2 or 3 questions for one apartment hunter in San Francisco (every listing is in SF), from what they revealed about themselves. If they reworded a question or wrote their own, that is what they care about: follow it.',
			'Go deeper on what they clearly care most about (how firm, what trade-offs they would make), follow up on why they passed on listings, and resolve contradictions between ranking and answers. Never repeat or rephrase a question they have seen, including ones they left blank (blank means it does not matter to them). Keep each question short and friendly; every question is optional.',
			`Each question: {"id": new snake_case id, "text", "type": one of ${QUESTION_TYPES.join('|')}, "options": [..] for select/multiselect, "maps_to": listing fields from ${PREF_FIELDS.join(', ')}, "why": under 8 words, e.g. "you ranked commute first"}.`,
			'Reply with JSON only: {"questions":[...]}'
		].join('\n');
		try {
			const { data } = await chatJSON<{ questions?: Array<FollowUp> }>('extractor', system, describe(input), { maxTokens: 1500 });
			// Repair common slips (maps_to as a string, numeric options), then keep each question that validates.
			const out = (data.questions ?? [])
				.slice(0, 3)
				.map((q) => ({
					...q,
					id: `fu_${String(q.id ?? '').toLowerCase().replace(/^fu_/, '').replace(/[^a-z0-9_]/g, '_') || 'q'}`,
					maps_to: (Array.isArray(q.maps_to) ? q.maps_to : [q.maps_to]).filter((f) => PREF_FIELDS.includes(f as never)),
					...(Array.isArray(q.options) ? { options: q.options.map(String) } : {})
				}))
				.filter((q) => !asked.has(q.id))
				.filter(({ why: _why, ...q }) => !checkQuestions([q], 'follow-ups', 'questions').length);
			if (out.length) return out.map((q) => ({ ...q, why: String(q.why ?? '').slice(0, 60) }));
		} catch (e) {
			console.warn(`follow-ups fell back to rules: ${(e as Error).message}`);
		}
	}
	// Offline: bank questions about the fields behind their pass reasons and top priorities.
	const topFields = new Set(input.ranking.slice(0, 2).flatMap((id) => input.questions.find((q) => q.id === id)?.maps_to ?? []));
	const reasonFields = new Set(
		input.passes.flatMap((r) =>
			[
				/expensive|price/i.test(r) && 'price',
				/commute/i.test(r) && 'commute',
				/loud|noise|quiet/i.test(r) && 'street_noise',
				/laundry/i.test(r) && 'laundry',
				/layout/i.test(r) && 'layout',
				/floor|stairs/i.test(r) && 'floor',
				/neighborhood/i.test(r) && 'neighborhood'
			].filter(Boolean) as string[]
		)
	);
	return input.bank
		.filter((q) => !asked.has(q.id) && q.maps_to.some((f) => reasonFields.has(f) || topFields.has(f)))
		.slice(0, 3)
		.map((q) => ({ ...q, id: `fu_${q.id}`, why: q.maps_to.some((f) => reasonFields.has(f)) ? 'from why you passed' : 'you ranked this high' }));
}
