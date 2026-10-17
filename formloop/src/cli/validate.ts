// npm run validate: load every research/ file, print a one-screen summary, exit 1 on any problem.
// FORMLOOP_RESEARCH_DIR=/some/copy npm run validate checks a different copy of the files.

import { generatePersonas, splitPersonas } from '../personas.ts';
import {
	checkPersonas,
	loadEvalConfig,
	loadNotes,
	loadPersonas,
	loadQuestionBank,
	researchDir,
	researchWarnings
} from '../research.ts';
import { BEHAVIORS } from '../types.ts';
import type { EvalConfig, Persona, Question } from '../types.ts';

const errors: string[] = [];
function attempt<T>(load: () => T): T | undefined {
	try {
		return load();
	} catch (e) {
		errors.push(e instanceof Error ? e.message : String(e));
		return undefined;
	}
}

const questions: Question[] | undefined = attempt(loadQuestionBank);
const personas: Persona[] | undefined = attempt(loadPersonas);
const cfg: EvalConfig | undefined = attempt(loadEvalConfig);
const notes: string | undefined = attempt(loadNotes);

console.log(`research dir: ${researchDir}`);

if (questions) {
	const byType: Record<string, number> = {};
	for (const q of questions) byType[q.type] = (byType[q.type] ?? 0) + 1;
	const types = Object.entries(byType)
		.map(([t, n]) => `${n} ${t}`)
		.join(', ');
	console.log(`question_bank.yaml  ${questions.length} questions (${types})`);
}

if (personas) {
	const covered = BEHAVIORS.filter((b) => personas.some((p) => p.behavior === b));
	const missing = BEHAVIORS.filter((b) => !covered.includes(b));
	console.log(`personas.yaml       ${personas.length} seed personas: ${personas.map((p) => p.id).join(', ')}`);
	console.log(`                    behaviors covered ${covered.length}/${BEHAVIORS.length}: ${covered.join(', ')}`);
	if (missing.length) console.log(`                    missing behaviors: ${missing.join(', ')}`);
}

if (cfg) {
	console.log(
		`eval_config.yaml    seed ${cfg.seed}, ${cfg.listings.count} ${cfg.listings.source} listings, ` +
			`batches train ${cfg.train_batch_size} / acceptance ${cfg.acceptance_batch_size} / held-out ${cfg.heldout_size}, ` +
			`${cfg.questions_shown} questions shown, top_k ${cfg.top_k}, ${cfg.rounds} rounds`
	);
}

if (notes !== undefined) {
	const bullets = notes.split('\n').filter((l) => /^\s*[-*] /.test(l)).length;
	console.log(`NOTES.md            ${notes.split('\n').length} lines, ${bullets} findings`);
}

// Generated personas must pass the same rules as hand-written ones.
if (personas && cfg) {
	const all = generatePersonas(personas.length + 50, cfg.seed, personas);
	const genProblems = checkPersonas(all.slice(personas.length), 'personas.yaml (generated)', 'generated');
	if (genProblems.length) errors.push(`generated personas have problems (bug in src/personas.ts):\n  - ${genProblems.join('\n  - ')}`);
	const split = splitPersonas(cfg, personas);
	const ids = (ps: Persona[]) => ps.map((p) => p.id).join(' ');
	console.log(`persona split       train: ${ids(split.train)}`);
	console.log(`                    acceptance: ${ids(split.acceptance)}`);
	console.log(`                    held-out: ${ids(split.heldout)}`);
}

console.log(`warnings: ${researchWarnings.length}${researchWarnings.length ? ' (see above)' : ''}`);

if (errors.length) {
	console.error(`\nFAILED: ${errors.length} file${errors.length === 1 ? '' : 's'} with problems\n`);
	console.error(errors.join('\n\n'));
	process.exit(1);
}
console.log('OK: all research files are valid.');
