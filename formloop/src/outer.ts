// Outer-loop plumbing: fresh renter batches per generation, batch runs, and the per-question reaction log.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalConfig, Form, Listing, Persona } from './types.ts';
import { generatePersonas, isGenerated, splitPersonas } from './personas.ts';
import { runRenter, type RenterResult } from './loop.ts';
import { rngFor, shuffle } from './rng.ts';
import { formloopDir } from './config.ts';

export const logsDir = join(formloopDir, 'logs');
export const reactionLog = join(logsDir, 'reactions.jsonl');
export const generationLog = join(logsDir, 'generations.jsonl');

/**
 * Generation g gets its own train and acceptance renters, never reused and never from the held-out set,
 * so every acceptance test is on renters the reviewer hasn't seen.
 */
export function batchesFor(g: number, cfg: EvalConfig, seeds: Persona[]) {
	const per = cfg.train_batch_size + cfg.acceptance_batch_size;
	const all = generatePersonas(seeds.length + cfg.heldout_size + (g + 1) * per + 10, cfg.seed, seeds);
	const heldout = splitPersonas(cfg, all).heldout;
	const held = new Set(heldout.map((p) => p.id));
	const pool = [...shuffle(rngFor(cfg.seed, 'seed-order'), seeds), ...all.filter((p) => isGenerated(p) && !held.has(p.id))];
	const start = g * per;
	return {
		train: pool.slice(start, start + cfg.train_batch_size),
		acceptance: pool.slice(start + cfg.train_batch_size, start + per),
		heldout
	};
}

export async function runBatch(
	personas: Persona[],
	form: Form,
	listings: Listing[],
	cfg: EvalConfig,
	offline: boolean
): Promise<RenterResult[]> {
	// Renters run concurrently; crusoe.ts paces requests per model under the RPM cap.
	return Promise.all(personas.map((p) => runRenter(p, form, listings, cfg, { offline })));
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export type QuestionSummary = {
	id: string;
	text: string;
	shown: number;
	skip_rate: number;
	rewrite_rate: number;
	mean_seconds: number;
	mean_delta: number;
	mean_value: number;
	rewrites: string[];
};

export function summarizeQuestions(form: Form, results: RenterResult[]): QuestionSummary[] {
	return form.questions.map((q) => {
		const rows = results.flatMap((r) => r.questions.filter((x) => x.id === q.id));
		const n = rows.length || 1;
		return {
			id: q.id,
			text: q.text,
			shown: rows.length,
			skip_rate: rows.filter((x) => x.action === 'skip').length / n,
			rewrite_rate: rows.filter((x) => x.action === 'rewrite').length / n,
			mean_seconds: mean(rows.map((x) => x.seconds)),
			mean_delta: mean(rows.map((x) => x.delta)),
			mean_value: mean(rows.map((x) => x.value)),
			rewrites: [...new Set(rows.map((x) => x.rewritten_text).filter(Boolean) as string[])].slice(0, 4)
		};
	});
}

/** Append one row per (renter, question) so researchers can analyze reactions across versions. */
export function logReactions(generation: number, form: Form, results: RenterResult[]) {
	mkdirSync(logsDir, { recursive: true });
	const at = new Date().toISOString();
	const lines = results.flatMap((r) =>
		r.questions.map((q) => {
			const a = r.answers.find((x) => x.question_id === q.id);
			return JSON.stringify({
				at,
				generation,
				form: form.version,
				persona: r.persona,
				behavior: r.behavior,
				question_id: q.id,
				text: form.questions.find((x) => x.id === q.id)?.text,
				action: q.action,
				rewritten_text: q.rewritten_text,
				importance: a?.importance,
				seconds: q.seconds,
				delta: Number(q.delta.toFixed(4)),
				value: Number(q.value.toFixed(4))
			});
		})
	);
	appendFileSync(reactionLog, lines.join('\n') + '\n');
}

export function logGeneration(row: Record<string, unknown>) {
	mkdirSync(logsDir, { recursive: true });
	appendFileSync(generationLog, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n');
}
