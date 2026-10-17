// Held-out evaluation: form v1 vs the latest accepted version on renters no generation ever saw.
//   npm run eval                  live models if a key is set
//   npm run eval -- --offline     rule-based renters and agent
//   npm run eval -- --form 3      compare v1 against a specific version
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEvalConfig, loadPersonas, loadQuestionBank } from '../research.ts';
import { ensureV1, latestForm, loadForm } from '../forms.ts';
import { loadListings } from '../listings.ts';
import { hasCrusoeKey, usageLog, usageSummary } from '../crusoe.ts';
import { batchesFor, mean, runBatch } from '../outer.ts';
import { formloopDir } from '../config.ts';
import type { RenterResult } from '../loop.ts';
import type { Form } from '../types.ts';

const { values } = parseArgs({ options: { offline: { type: 'boolean', default: false }, form: { type: 'string' } } });
const offline = values.offline || !hasCrusoeKey();
const cfg = loadEvalConfig();
const bank = loadQuestionBank();
const seeds = loadPersonas();
const v1 = ensureV1(bank, cfg);
const latest = values.form ? loadForm(Number(values.form)) : latestForm(bank, cfg);
const listings = await loadListings(cfg);
const { heldout } = batchesFor(0, cfg, seeds);

console.log(`Held-out eval: v1 vs v${latest.version} on ${heldout.length} renters (${heldout.map((p) => p.id).join(' ')}), ${offline ? 'OFFLINE' : 'live Crusoe models'}`);
if (latest.version === 1) console.warn('Only v1 exists; run `npm run generation` until a version is accepted.');

const forms: Form[] = latest.version === 1 ? [v1] : [v1, latest];
const results = await Promise.all(forms.map((f) => runBatch(heldout, f, listings, cfg, offline)));

type Row = { form: string; match_quality: number; dealbreaker_misses: number; questions_asked: number; answered: number; skip_rate: number; rewrite_rate: number; friction: number; objective: number };
const rowFor = (f: Form, rs: RenterResult[]): Row => {
	const qs = rs.flatMap((r) => r.questions);
	return {
		form: `v${f.version}`,
		match_quality: mean(rs.map((r) => r.quality)),
		dealbreaker_misses: rs.filter((r) => r.quality === 0).length,
		questions_asked: Math.min(cfg.questions_shown, f.questions.length),
		answered: mean(rs.map((r) => r.questions.filter((q) => q.action !== 'skip').length)),
		skip_rate: qs.filter((q) => q.action === 'skip').length / (qs.length || 1),
		rewrite_rate: qs.filter((q) => q.action === 'rewrite').length / (qs.length || 1),
		friction: mean(rs.map((r) => r.friction)),
		objective: mean(rs.map((r) => r.objective))
	};
};
const rows = forms.map((f, i) => rowFor(f, results[i]));

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const header = ['form', 'match quality', 'dealbreaker misses', 'questions asked', 'answered (mean)', 'skip rate', 'rewrite rate', 'friction', 'objective'];
const cells = rows.map((r) => [
	r.form,
	r.match_quality.toFixed(3),
	`${r.dealbreaker_misses}/${heldout.length}`,
	String(r.questions_asked),
	r.answered.toFixed(1),
	pct(r.skip_rate),
	pct(r.rewrite_rate),
	r.friction.toFixed(2),
	r.objective.toFixed(3)
]);
const table = [
	`| ${header.join(' | ')} |`,
	`| ${header.map(() => '---').join(' | ')} |`,
	...cells.map((c) => `| ${c.join(' | ')} |`)
].join('\n');

const perRenter = heldout
	.map((p, i) => `| ${p.id} | ${p.behavior} | ${results.map((rs) => rs[i].quality.toFixed(3)).join(' | ')} |`)
	.join('\n');
const cost = usageLog.reduce((a, u) => a + u.cost, 0);
const md = [
	`# Held-out evaluation: v1 vs v${latest.version}`,
	'',
	`${new Date().toISOString()} · ${heldout.length} held-out renters never used in any generation · ${listings.length} listings (${cfg.listings.source}) · seed ${cfg.seed} · ${offline ? 'offline rule-based renters and agent' : 'live Crusoe models'} · ${usageLog.length} LLM calls, $${cost.toFixed(4)}`,
	'',
	table,
	'',
	`Match quality is the percentile of the final pick under the renter's hidden preferences (1 = their best listing, 0 = breaks their dealbreaker). Objective = match quality - ${cfg.friction_weight} x friction.`,
	'',
	latest.version > 1 ? `v${latest.version} note: ${latest.note ?? ''}` : '',
	'',
	`| renter | behavior | ${forms.map((f) => `v${f.version} quality`).join(' | ')} |`,
	`| --- | --- | ${forms.map(() => '---').join(' | ')} |`,
	perRenter,
	''
].join('\n');

console.log('\n' + table + '\n');
const dir = join(formloopDir, '..', 'results');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const base = join(dir, `heldout_v1_vs_v${latest.version}_${offline ? 'offline' : 'live'}_${stamp}`);
writeFileSync(`${base}.md`, md);
writeFileSync(`${base}.json`, JSON.stringify({ rows, perRenter: heldout.map((p, i) => ({ id: p.id, behavior: p.behavior, quality: results.map((rs) => rs[i].quality) })) }, null, 2));
console.log(`Saved ${relative(process.cwd(), base)}.md and .json`);
console.log(usageSummary());
