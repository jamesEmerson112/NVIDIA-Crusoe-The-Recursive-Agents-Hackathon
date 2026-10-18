// You.com web search for the agent's web_search tool (docs/research/you-com-api.md).
// POST https://ydc-index.io/v1/search with an X-API-Key header; $5 per 1k calls.
// The key never leaves this module: results carry only title, url, snippet and page_age.
import { YDC_API_KEY } from '$app/env/private';

export interface WebResult {
	title: string;
	url: string;
	snippet: string;
	page_age?: string;
}

export interface WebSearchOptions {
	count?: number;
	includeDomains?: string[];
	freshness?: string;
	signal?: AbortSignal;
}

export const hasYdcKey = () => Boolean(YDC_API_KEY);

const FRESHNESS = /^(day|week|month|year|\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2})$/;
const SNIPPET_CHARS = 300;

// Identical searches in one server process cost nothing and replay the same results.
const cache = new Map<string, WebResult[]>();

export class WebSearchError extends Error {}

export async function webSearch(query: string, opts: WebSearchOptions = {}): Promise<WebResult[]> {
	if (!YDC_API_KEY) throw new WebSearchError('Web search is not configured (no YDC_API_KEY).');
	const q = query.trim();
	if (!q) throw new WebSearchError('query is empty');
	const count = Math.max(1, Math.min(5, Math.round(opts.count ?? 5)));
	const body: Record<string, unknown> = { query: q, count, country: 'US' };
	const domains = (opts.includeDomains ?? [])
		.map((d) =>
			String(d)
				.trim()
				.replace(/^https?:\/\//, '')
				.replace(/\/.*$/, '')
		)
		.filter(Boolean)
		.slice(0, 20);
	if (domains.length) body.include_domains = domains;
	if (opts.freshness && FRESHNESS.test(opts.freshness)) body.freshness = opts.freshness;

	const key = JSON.stringify(body);
	const hit = cache.get(key);
	if (hit) return hit;

	let res: Response | undefined;
	for (let attempt = 0; attempt < 3; attempt++) {
		res = await fetch('https://ydc-index.io/v1/search', {
			method: 'POST',
			headers: { 'X-API-Key': YDC_API_KEY, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: opts.signal
				? AbortSignal.any([opts.signal, AbortSignal.timeout(15_000)])
				: AbortSignal.timeout(15_000)
		});
		if ((res.status !== 429 && res.status < 500) || attempt === 2) break;
		const retryAfter = Number(res.headers.get('retry-after'));
		const wait = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt * (0.5 + Math.random());
		await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
	}
	if (!res!.ok) {
		const reason: Record<number, string> = {
			401: 'invalid API key',
			402: 'out of You.com credit',
			403: 'key lacks access',
			422: 'invalid search parameters',
			429: 'rate limited'
		};
		throw new WebSearchError(
			`You.com search failed (${res!.status} ${reason[res!.status] ?? ''})`.replace(' )', ')')
		);
	}
	const json = (await res!.json()) as {
		results?: {
			web?: Array<{
				url?: string;
				title?: string;
				description?: string;
				snippets?: string[];
				page_age?: string;
			}>;
		};
	};
	const results = (json.results?.web ?? [])
		.filter((r) => r.url)
		.slice(0, count)
		.map((r) => {
			const text = [r.description, ...(r.snippets ?? [])].filter(Boolean).join(' … ');
			const out: WebResult = {
				title: String(r.title ?? '').slice(0, 200),
				url: String(r.url),
				snippet: text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS)}…` : text
			};
			if (r.page_age) out.page_age = String(r.page_age).slice(0, 10);
			return out;
		});
	cache.set(key, results);
	return results;
}
