// npm run listings [-- --count 300 --seed 42]: print a sample of the synthetic listings.
// Listings are synthetic on purpose: we don't query listing sites. You.com only grounds renters' own factors.
import { parseArgs } from 'node:util';
import { generateListings } from '../listings.ts';

const { values } = parseArgs({ options: { count: { type: 'string', default: '300' }, seed: { type: 'string', default: '42' } } });
const listings = generateListings(Number(values.count), Number(values.seed));
for (const l of listings.slice(0, 15)) {
	console.log(`${l.id}  ${l.neighborhood.padEnd(16)} ${(l.bedrooms === 0 ? 'studio' : `${l.bedrooms}BR`).padEnd(7)} $${String(l.price).padEnd(6)} ${String(l.laundry).padEnd(12)} ${l.layout}`);
}
console.log(`… ${listings.length} listings`);
