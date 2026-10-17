// One outer-loop generation:
//   1. run the latest form on a fresh batch of training renters and log every question's reactions
//   2. the reviewer agent proposes form v(N+1) from those reactions and research/NOTES.md
//   3. acceptance test: both forms on a fresh batch of renters neither has seen; keep v(N+1) only if it scores better
//   4. save the accepted form and git-commit it with its score
//
//   npm run generation                 live models if a key is set
//   npm run generation -- --offline    rule-based renters, agent and reviewer
//   npm run generation -- --no-commit  don't git-commit an accepted form
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEvalConfig, loadNotes, loadPersonas, loadQuestionBank } from '../research.ts';
import { ensureV1, latestForm, saveForm } from '../forms.ts';
import { loadListings } from '../listings.ts';
import { hasCrusoeKey, usageSummary } from '../crusoe.ts';
import { batchesFor, generationLog, logGeneration, logReactions, mean, reactionLog, runBatch, summarizeFactors, summarizeQuestions } from '../outer.ts';
import { proposeOffline, proposeOnline } from '../reviewer.ts';
import { formloopDir } from '../config.ts';
import type { Form } from '../types.ts';

const { values } = parseArgs({
	options: { offline: { type: 'boolean', default: false }, 'no-commit': { type: 'boolean', default: false } }
});
const offline = values.offline || !hasCrusoeKey();
const cfg = loadEvalConfig();
const bank = loadQuestionBank();
const seeds = loadPersonas();
const notes = loadNotes();
ensureV1(bank, cfg);
const current = latestForm(bank, cfg);
const listings = await loadListings(cfg);
const g = existsSync(generationLog) ? readFileSync(generationLog, 'utf8').split('\n').filter(Boolean).length : 0;
const { train, acceptance } = batchesFor(g, cfg, seeds);

console.log(`Generation ${g}: form v${current.version}, ${listings.length} listings, ${offline ? 'OFFLINE' : 'live Crusoe models'}`);
console.log(`  train renters:      ${train.map((p) => p.id).join(' ')}`);
console.log(`  acceptance renters: ${acceptance.map((p) => p.id).join(' ')} (fresh)`);

// 1. Reactions on the training batch.
const trainResults = await runBatch(train, current, listings, cfg, offline);
logReactions(g, current, trainResults);
const stats = summarizeQuestions(current, trainResults);
console.log(`\nHow ${train.length} training renters reacted to v${current.version} (objective ${mean(trainResults.map((r) => r.objective)).toFixed(3)}):`);
for (const s of stats)
	console.log(
		`  ${s.id.padEnd(22)} skip ${(100 * s.skip_rate).toFixed(0).padStart(3)}%  rewrite ${(100 * s.rewrite_rate).toFixed(0).padStart(3)}%  ${s.mean_seconds.toFixed(0).padStart(3)}s  delta ${s.mean_delta.toFixed(3).padStart(6)}  value ${s.mean_value.toFixed(3).padStart(6)}`
	);

// 2. Reviewer proposes the next version.
const factorStats = summarizeFactors(trainResults);
if (factorStats.length) console.log(`\nNew factors renters introduced: ${factorStats.map((f) => `"${f.text}" x${f.renters} (${f.resolution.status})`).join(', ')}`);
const proposal = offline ? proposeOffline(current, stats, bank, cfg) : await proposeOnline(current, stats, bank, notes, cfg, factorStats);
const candidate: Form = { version: current.version + 1, parent: current.version, questions: proposal.questions, note: proposal.note };
console.log(`\nReviewer (${proposal.by}) proposes v${candidate.version}: ${proposal.note}`);
for (const q of candidate.questions) {
	const old = current.questions.find((x) => x.id === q.id);
	const tag = !old ? 'NEW ' : old.text !== q.text ? 'EDIT' : '    ';
	console.log(`  ${tag} ${q.id}: ${q.text}${q.resolved ? `  [grounded: ${q.resolved.factor}]` : ''}`);
}
for (const q of current.questions) if (!candidate.questions.some((x) => x.id === q.id)) console.log(`  DROP ${q.id}: ${q.text}`);

// 3. Acceptance test on fresh renters, same renters for both forms.
const [before, after] = await Promise.all([
	runBatch(acceptance, current, listings, cfg, offline),
	runBatch(acceptance, candidate, listings, cfg, offline)
]);
const scoreBefore = mean(before.map((r) => r.objective));
const scoreAfter = mean(after.map((r) => r.objective));
const accepted = scoreAfter > scoreBefore;
const row = (label: string, rs: typeof before) =>
	`  ${label.padEnd(5)} objective ${mean(rs.map((r) => r.objective)).toFixed(3)}  quality ${mean(rs.map((r) => r.quality)).toFixed(3)}  friction ${mean(rs.map((r) => r.friction)).toFixed(2)}`;
console.log(`\nAcceptance test on ${acceptance.length} fresh renters:`);
console.log(row(`v${current.version}`, before));
console.log(row(`v${candidate.version}`, after));

const delta = scoreAfter - scoreBefore;
logGeneration({
	generation: g,
	from: current.version,
	candidate: candidate.version,
	accepted,
	score_before: Number(scoreBefore.toFixed(4)),
	score_after: Number(scoreAfter.toFixed(4)),
	reviewer: proposal.by,
	note: proposal.note,
	train: train.map((p) => p.id),
	acceptance: acceptance.map((p) => p.id),
	offline
});

if (!accepted) {
	console.log(`\nRejected v${candidate.version} (${delta.toFixed(3)}); v${current.version} stays current.`);
} else {
	candidate.score = Number(scoreAfter.toFixed(4));
	const path = saveForm(candidate);
	console.log(`\nAccepted v${candidate.version} (+${delta.toFixed(3)}), saved ${relative(process.cwd(), path)}`);
	if (!values['no-commit']) {
		const files = [path, reactionLog, generationLog].map((f) => relative(formloopDir, f));
		const message =
			`Form v${candidate.version}: objective ${scoreAfter.toFixed(3)} vs ${scoreBefore.toFixed(3)} for v${current.version} on ${acceptance.length} fresh renters (+${delta.toFixed(3)})\n\n` +
			`${proposal.note}\n\nReviewer: ${proposal.by}${offline ? ' (offline run)' : ''}. Generated by formloop generation ${g}.`;
		try {
			execFileSync('git', ['add', '--', ...files], { cwd: formloopDir });
			execFileSync('git', ['commit', '-q', '-m', message, '--', ...files], { cwd: formloopDir });
			console.log(`Committed: ${execFileSync('git', ['log', '--oneline', '-1'], { cwd: formloopDir, encoding: 'utf8' }).trim()}`);
		} catch (e) {
			console.warn(`git commit failed (form is saved): ${(e as Error).message.split('\n')[0]}`);
		}
	}
}
console.log(`\n${usageSummary()}`);
