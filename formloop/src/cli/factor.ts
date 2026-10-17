// Resolve renter factors end to end through You.com (cache first) and print the mapping with sources.
//   npm run factor -- "near the 14 bus" "walking distance to a dog park" "away from freeway noise"
// Running it before the demo pre-warms the cache, so the page and every simulation can run cache-only.
import { resolveFactor } from '../factors.ts';
import { hasYdcKey } from '../ydc.ts';
import { usageSummary } from '../crusoe.ts';

const factors = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cacheOnly = process.argv.includes('--cache-only');
if (!factors.length) {
	console.error('Usage: npm run factor -- "near the 14 bus" ["another factor" ...] [--cache-only]');
	process.exit(1);
}
if (!hasYdcKey() && !cacheOnly) console.warn('YDC_API_KEY is not set: only cached factors can resolve.');
for (const f of factors) {
	const r = await resolveFactor(f, { cacheOnly });
	console.log(`\n"${f}" -> ${r.status.toUpperCase()}${r.confidence ? ` (confidence ${r.confidence})` : ''}`);
	if (r.neighborhoods) console.log(`  neighborhoods: ${r.neighborhoods.join(', ')}`);
	if (r.rule) console.log(`  rule: ${r.rule.field} ${r.rule.op} ${JSON.stringify(r.rule.value)}${r.rule.dest ? ` (${r.rule.dest})` : ''}`);
	if (r.rationale) console.log(`  why: ${r.rationale}`);
	if (r.reason) console.log(`  reason: ${r.reason}`);
	for (const s of r.sources) console.log(`  source: ${s}`);
}
console.log(`\n${usageSummary()}`);
