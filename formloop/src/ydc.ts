// You.com Search client with a disk cache (cache/ydc/, keyed by query). Every call checks the cache first.
// Cache-only mode (YDC_CACHE_ONLY=1, or { cacheOnly: true }) never touches the network: a miss returns null.
// API: POST https://ydc-index.io/v1/search, header X-API-Key, results in results.web[] (docs read 2026-10-17;
// also measured live in docs/research/you-com-api.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formloopDir } from './config.ts';
import { getEnv } from './env.ts';

export const ydcCacheDir = join(formloopDir, 'cache', 'ydc');

/** Never query or keep results from listing sites. */
export const LISTING_SITES = [
	'zillow.com', 'apartments.com', 'craigslist.org', 'trulia.com', 'hotpads.com', 'zumper.com', 'padmapper.com',
	'redfin.com', 'realtor.com', 'rent.com', 'apartmentlist.com', 'apartmentguide.com', 'rentcafe.com', 'streeteasy.com'
];

export type YdcResult = { url: string; title: string; description: string; snippets: string[] };

export const ydcCacheOnly = () => getEnv('YDC_CACHE_ONLY') === '1';
export const hasYdcKey = () => Boolean(getEnv('YDC_API_KEY'));

const keyFor = (query: string) => createHash('sha1').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
};
const isListingSite = (url: string) => LISTING_SITES.some((d) => host(url) === d || host(url).endsWith(`.${d}`));

/** Search results for a short query, from cache if present. null = not cached and network not allowed or no key. */
export async function ydcSearch(query: string, opts: { count?: number; cacheOnly?: boolean } = {}): Promise<YdcResult[] | null> {
	const file = join(ydcCacheDir, `${keyFor(query)}.json`);
	if (existsSync(file)) return (JSON.parse(readFileSync(file, 'utf8')) as { results: YdcResult[] }).results;
	const key = getEnv('YDC_API_KEY');
	if (opts.cacheOnly || ydcCacheOnly() || !key) return null;
	const count = Math.min(opts.count ?? 5, 10);
	const call = (body: Record<string, unknown>) =>
		fetch('https://ydc-index.io/v1/search', {
			method: 'POST',
			headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	let res = await call({ query, count, country: 'US', exclude_domains: LISTING_SITES });
	// If the domain filter is rejected, search without it; listing sites are still dropped below.
	if (res.status === 400 || res.status === 422) res = await call({ query, count, country: 'US' });
	if (!res.ok) throw new Error(`You.com search ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const json = (await res.json()) as { results?: { web?: Array<Partial<YdcResult>> } };
	const results = (json.results?.web ?? [])
		.filter((r) => r.url && !isListingSite(r.url))
		.slice(0, count)
		.map((r) => ({
			url: String(r.url),
			title: String(r.title ?? ''),
			description: String(r.description ?? '').slice(0, 400),
			snippets: (r.snippets ?? []).slice(0, 3).map((s) => String(s).slice(0, 400))
		}));
	mkdirSync(ydcCacheDir, { recursive: true });
	writeFileSync(file, JSON.stringify({ query, fetched_at: new Date().toISOString(), results }, null, 2));
	return results;
}
