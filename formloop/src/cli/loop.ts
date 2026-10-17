// One renter, one form, end to end in the terminal.
//   npm run loop                      first hand-written persona, latest form, live models if a key is set
//   npm run loop -- --persona dana    pick a persona by id
//   npm run loop -- --form 1          pick a form version
//   npm run loop -- --offline         rule-based renter and agent, no API calls
import { parseArgs } from 'node:util';
import { loadEvalConfig, loadPersonas, loadQuestionBank } from '../research.ts';
import { generatePersonas } from '../personas.ts';
import { ensureV1, latestForm, loadForm } from '../forms.ts';
import { describeListing, loadListings } from '../listings.ts';
import { hasCrusoeKey, usageSummary } from '../crusoe.ts';
import { runRenter } from '../loop.ts';

const { values } = parseArgs({
	options: {
		persona: { type: 'string' },
		form: { type: 'string' },
		offline: { type: 'boolean', default: false }
	}
});

const cfg = loadEvalConfig();
const bank = loadQuestionBank();
const seeds = loadPersonas();
ensureV1(bank, cfg);
const form = values.form ? loadForm(Number(values.form)) : latestForm(bank, cfg);
const all = generatePersonas(Math.max(seeds.length, 40), cfg.seed, seeds);
const persona = values.persona ? all.find((p) => p.id === values.persona) : seeds[0];
if (!persona) throw new Error(`No persona "${values.persona}". Ids: ${all.map((p) => p.id).join(', ')}`);
const offline = values.offline || !hasCrusoeKey();
const listings = await loadListings(cfg);

console.log(`Form v${form.version} (${form.questions.length} questions, showing ${Math.min(cfg.questions_shown, form.questions.length)}) · ${listings.length} listings · ${offline ? 'OFFLINE rule-based renter and agent' : 'live Crusoe models'}`);
console.log(`Renter: ${persona.name} [${persona.id}, ${persona.behavior}] ${persona.blurb}\n`);

const result = await runRenter(persona, form, listings, cfg, { offline, log: console.log, llmReactions: true });

console.log(`\nFirst pick:  ${describeListing(result.firstPick)}`);
console.log(`Final pick:  ${describeListing(result.final)}`);
console.log(`\nScore against hidden preferences`);
console.log(`  match quality ${result.quality.toFixed(3)}  (percentile of the pick under the renter's true utility; 0 if it breaks the dealbreaker)`);
console.log(`  friction      ${result.friction.toFixed(2)}  (skips, rewrites, seconds)`);
console.log(`  objective     ${result.objective.toFixed(3)}  (quality - ${cfg.friction_weight} x friction)`);
console.log(`\nQuestion value (ablation: quality drop when the answer is removed, minus friction)`);
for (const q of result.questions) {
	console.log(`  ${q.id.padEnd(22)} ${q.action.padEnd(7)} delta ${q.delta.toFixed(3).padStart(6)}  friction ${q.friction.toFixed(2).padStart(5)}  value ${q.value.toFixed(3).padStart(6)}`);
}
console.log(`\n${usageSummary()}`);
