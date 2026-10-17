// The reviewer agent: reads how renters reacted to each question plus research/NOTES.md and proposes
// form v(N+1): reword, reorder, drop, or promote a renter's rewritten question into a new question.
import type { EvalConfig, Form, Question } from './types.ts';
import { PREF_FIELDS, QUESTION_TYPES } from './types.ts';
import { chatJSON } from './crusoe.ts';
import { checkQuestions } from './research.ts';
import type { QuestionSummary } from './outer.ts';

export type Proposal = { questions: Question[]; note: string; by: 'reviewer' | 'rules' };

const pct = (x: number) => `${Math.round(100 * x)}%`;

function statsTable(stats: QuestionSummary[]) {
	return stats
		.map(
			(s) =>
				`- ${s.id}: "${s.text}" | skip ${pct(s.skip_rate)}, rewrite ${pct(s.rewrite_rate)}, ${s.mean_seconds.toFixed(0)}s, ` +
				`changed-the-pick ${s.mean_delta.toFixed(3)}, value ${s.mean_value.toFixed(3)}` +
				(s.rewrites.length ? `\n  renters rewrote it as: ${s.rewrites.map((r) => `"${r}"`).join('; ')}` : '')
		)
		.join('\n');
}

export async function proposeOnline(
	form: Form,
	stats: QuestionSummary[],
	bank: Question[],
	notes: string,
	cfg: EvalConfig
): Promise<Proposal> {
	const unused = bank.filter((q) => !form.questions.some((x) => x.id === q.id));
	const system = [
		`You redesign an apartment-search intake form so it finds renters a better apartment with less effort.`,
		`Question value = how much the answer changed the top recommendation (measured by re-running the match without it) minus friction (skips, rewrites, seconds). Negative value means the question costs more than it helps.`,
		`You may reword, reorder (most valuable first), drop, add a question from the bank, or promote a renter's rewrite into a new question. Change at most 3 things; small careful edits beat rewrites. At most ${cfg.questions_shown} questions. Every question stays optional.`,
		`Keep the id of any question you keep or reword. New questions need a new snake_case id. type is one of ${QUESTION_TYPES.join(', ')}; select/multiselect need options; maps_to lists listing fields from: ${PREF_FIELDS.join(', ')}.`,
		`Research notes from the team's researcher (follow them):\n${notes.trim()}`,
		`Reply with JSON only: {"note":"one or two sentences on what you changed and why","questions":[{"id","text","type","options"?,"maps_to","help"?}]}`
	].join('\n\n');
	const user = [
		`Current form v${form.version} and how renters reacted:\n${statsTable(stats)}`,
		`Unused questions in the bank:\n${unused.map((q) => `- ${q.id} (${q.type}, ${q.maps_to.join('/')}): ${q.text}`).join('\n') || '(none)'}`
	].join('\n\n');
	let feedback = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		const { data } = await chatJSON<{ note?: string; questions?: Question[] }>('reviewer', system, user + feedback);
		const questions = (data.questions ?? []).slice(0, cfg.questions_shown);
		const problems = checkQuestions(questions, `forms/v${form.version + 1}.yaml`, 'questions');
		if (!problems.length && questions.length) return { questions, note: String(data.note ?? '').slice(0, 400), by: 'reviewer' };
		feedback = `\n\nYour last proposal had problems; fix them:\n${problems.join('\n') || 'no questions'}`;
	}
	console.warn('Reviewer output failed validation twice; falling back to the rule-based reviewer');
	return proposeOffline(form, stats, bank, cfg);
}

/** Rule-based reviewer for offline runs: promote the most-rewritten wording, swap out the worst question, sort by value. */
export function proposeOffline(form: Form, stats: QuestionSummary[], bank: Question[], cfg: EvalConfig): Proposal {
	const byId = new Map(stats.map((s) => [s.id, s]));
	let questions = form.questions.map((q) => ({ ...q }));
	const changes: string[] = [];

	const rewritten = [...stats].filter((s) => s.rewrites.length).sort((a, b) => b.rewrite_rate - a.rewrite_rate)[0];
	if (rewritten) {
		const q = questions.find((x) => x.id === rewritten.id)!;
		changes.push(`reworded ${q.id} to a renter's version ("${rewritten.rewrites[0]}")`);
		q.text = rewritten.rewrites[0];
	}

	const worst = [...stats].sort((a, b) => a.mean_value - b.mean_value)[0];
	const replacement = bank.find((q) => !questions.some((x) => x.id === q.id));
	if (worst && worst.mean_delta <= 0 && worst.mean_value < 0 && replacement) {
		questions = questions.map((q) => (q.id === worst.id ? { ...replacement } : q));
		changes.push(`swapped ${worst.id} (value ${worst.mean_value.toFixed(3)}) for ${replacement.id}`);
	}

	questions.sort((a, b) => (byId.get(b.id)?.mean_value ?? 0) - (byId.get(a.id)?.mean_value ?? 0));
	changes.push('sorted by value');
	return { questions: questions.slice(0, cfg.questions_shown), note: changes.join('; '), by: 'rules' };
}
