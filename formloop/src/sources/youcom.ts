// Real San Francisco rental listings from the You.com Search API, normalized to the Listing contract.
//
// API (docs read 2026-10-17: https://you.com/docs/api-reference/search/v1-search, /docs/quickstart):
//   POST https://ydc-index.io/v1/search, header `X-API-Key`, JSON body { query, count, country, safesearch, extraction }.
//   200 -> { results: { web: [{ url, title, description, snippets[], page_age, contents?: { markdown, html, highlights } }],
//                       news: [...] }, metadata: { search_uuid, query, latency } }
//   `extraction.extraction_source: 'cache'` returns page text only where You.com already has it cached, at no extra
//   charge. Older docs show GET with `livecrawl`/`livecrawl_formats` (now deprecated); we fall back to plain requests.
//   Pricing: $5 per 1k searches; 8 queries = $0.04 per refresh.
//
// The cache (data/listings.youcom.json) holds normalized fields, URLs and titles only, never page text, and every
// call after the first reads it, so runs are reproducible and spend no credits. `--refresh` re-fetches.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNDRY, LAYOUTS, NEIGHBORHOODS, NOISE, PETS } from '../types.ts';
import type { Listing } from '../types.ts';
import { rngFor, shuffle } from '../rng.ts';
import { getEnv } from '../env.ts';
import { chatJSON, hasCrusoeKey } from '../crusoe.ts';
import { estimateCommute } from '../listings.ts';

const ENDPOINT = 'https://ydc-index.io/v1/search';
const COUNT_PER_QUERY = 20;
const CACHE_PATH = fileURLToPath(new URL('../../data/listings.youcom.json', import.meta.url));
const LLM_BATCH = 5;
const LLM_MAX_CANDIDATES = 80;
const LLM_CONCURRENCY = 3;

/** Fixed query set (<= 8), spread across neighborhoods and bedroom counts. */
export const YOUCOM_QUERIES = [
	'San Francisco Mission District 1 bedroom apartment for rent',
	'San Francisco SoMa studio apartment for rent',
	'Hayes Valley San Francisco 2 bedroom apartment for rent',
	'Inner Sunset San Francisco 1 bedroom apartment for rent',
	'Noe Valley San Francisco 2 bedroom apartment for rent',
	'Marina Pacific Heights San Francisco 1 bedroom apartment for rent',
	'Inner Richmond San Francisco studio apartment for rent',
	'Nob Hill North Beach San Francisco 2 bedroom apartment for rent'
] as const;

type Hood = (typeof NEIGHBORHOODS)[number];
type Raw = { url: string; title: string; description: string; snippets: string[]; text: string };
type Fields = Omit<Listing, 'id' | 'source' | 'url' | 'title' | 'commute' | 'neighborhood' | 'price' | 'bedrooms' | 'bathrooms'> & {
	price: number | null;
	bedrooms: number | null;
	bathrooms: number | null;
	neighborhood: Hood | null;
};
type Candidate = { id: string; raw: Raw; verdict: 'listing' | 'maybe'; f: Fields; weakHood: Hood | null };
type CacheFile = { fetched_at: string; queries: string[]; stats?: Record<string, number>; listings: Listing[] };

// ---------------------------------------------------------------- public API

/**
 * Listings from You.com. Reads the cache when it exists (unless `refresh`), otherwise runs the fixed queries,
 * normalizes, caches every usable listing, and returns a seeded selection of at most `limit`.
 */
export async function fetchYoucomListings(opts: { limit: number; seed: number; refresh?: boolean }): Promise<Listing[]> {
	const cached = opts.refresh ? null : readYoucomCache();
	if (cached) {
		console.error(`youcom: ${cached.length} listings from cache (${CACHE_PATH})`);
		return select(cached, opts.limit, opts.seed);
	}
	const key = getEnv('YDC_API_KEY');
	if (!key) {
		throw new Error(
			'YDC_API_KEY is not set. Add it to frontend/.env (YDC_API_KEY=...) or formloop/.env, or export it, then rerun.'
		);
	}
	const { listings, stats } = await fetchAll(key);
	writeYoucomCache(listings, stats);
	console.error(`youcom: cached ${listings.length} listings to ${CACHE_PATH}`);
	return select(listings, opts.limit, opts.seed);
}

export function readYoucomCache(): Listing[] | null {
	if (!existsSync(CACHE_PATH)) return null;
	try {
		const file = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile;
		return Array.isArray(file.listings) ? file.listings : null;
	} catch {
		return null;
	}
}

export function writeYoucomCache(listings: Listing[], stats?: Record<string, number>): void {
	mkdirSync(dirname(CACHE_PATH), { recursive: true });
	const file: CacheFile = { fetched_at: new Date().toISOString(), queries: [...YOUCOM_QUERIES], stats, listings };
	writeFileSync(CACHE_PATH, JSON.stringify(file, null, '\t') + '\n');
}

export const youcomCachePath = CACHE_PATH;

function select(all: Listing[], limit: number, seed: number): Listing[] {
	const sorted = [...all].sort((a, b) => a.id.localeCompare(b.id));
	return shuffle(rngFor(seed, 'youcom'), sorted).slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------- fetching

async function fetchAll(key: string): Promise<{ listings: Listing[]; stats: Record<string, number> }> {
	const byUrl = new Map<string, Raw>();
	let rawCount = 0;
	for (const q of YOUCOM_QUERIES) {
		const results = await search(q, key);
		rawCount += results.length;
		for (const r of results) {
			const url = canonicalUrl(r.url);
			if (url && !byUrl.has(url)) byUrl.set(url, { ...r, url });
		}
		console.error(`youcom: "${q}" -> ${results.length} results`);
	}

	const candidates: Candidate[] = [];
	for (const raw of byUrl.values()) {
		const verdict = classify(raw);
		if (verdict === 'reject') continue;
		const { f, weakHood } = heuristics(raw);
		candidates.push({ id: idFor(raw.url), raw, verdict, f, weakHood });
	}

	const useLLM = hasCrusoeKey();
	if (useLLM) await llmNormalize(candidates);
	else console.error('youcom: no CRUSOE_API_KEY; keeping only listings the heuristics fully parsed');

	const listings: Listing[] = [];
	for (const c of candidates) {
		if (c.verdict === 'maybe' && !useLLM) continue; // only the LLM can confirm an ambiguous page
		const neighborhood = c.f.neighborhood ?? c.weakHood;
		const { price, bedrooms } = c.f;
		if (price == null || bedrooms == null || neighborhood == null) continue;
		listings.push({
			id: c.id,
			source: 'youcom',
			url: c.raw.url,
			title: cleanTitle(c.raw.title),
			neighborhood,
			price,
			bedrooms,
			// Listing.bathrooms is non-nullable; 1 is the honest floor when a listing doesn't say.
			bathrooms: c.f.bathrooms ?? 1,
			sqft: c.f.sqft,
			floor: c.f.floor,
			layout: c.f.layout,
			laundry: c.f.laundry,
			parking: c.f.parking,
			pets: c.f.pets,
			street_noise: c.f.street_noise,
			available: c.f.available,
			commute: estimateCommute(neighborhood)
		});
	}
	const stats = {
		raw_results: rawCount,
		unique_urls: byUrl.size,
		candidates: candidates.length,
		kept: listings.length,
		llm_normalized: useLLM ? 1 : 0
	};
	return { listings, stats };
}

async function search(query: string, key: string): Promise<Raw[]> {
	const base = { query, count: COUNT_PER_QUERY, country: 'US', safesearch: 'moderate' };
	const withText = {
		...base,
		extraction: { extraction_mode: 'full_page', extraction_source: 'cache', full_page: { extraction_formats: ['markdown'] } }
	};
	let res = await request('POST', withText, key);
	// Extraction rejected (older API version or plan): retry with snippets only.
	if (res.status === 400 || res.status === 422) res = await request('POST', base, key);
	if (res.status === 404 || res.status === 405) res = await request('GET', base, key);
	if (!res.ok) throw new Error(await describeError(res));
	return parseResults(await res.json());
}

async function request(method: 'GET' | 'POST', body: Record<string, unknown>, key: string): Promise<Response> {
	const headers: Record<string, string> = { 'X-API-Key': key, Accept: 'application/json' };
	let url = ENDPOINT;
	let payload: string | undefined;
	if (method === 'POST') {
		headers['Content-Type'] = 'application/json';
		payload = JSON.stringify(body);
	} else {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(body)) if (typeof v !== 'object') params.set(k, String(v));
		url += `?${params}`;
	}
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(45_000) });
		if ((res.status === 429 || res.status >= 500) && attempt < 2) {
			const retryAfter = Number(res.headers.get('retry-after'));
			const wait = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt + Math.random() * 500;
			await res.body?.cancel();
			await new Promise((r) => setTimeout(r, wait));
			continue;
		}
		return res;
	}
}

async function describeError(res: Response): Promise<string> {
	let detail = '';
	try {
		const j = (await res.json()) as Record<string, unknown>;
		detail = [j.error, j.message, j.detail, j.upgrade_url].filter((x) => typeof x === 'string').join(' ');
	} catch {
		/* body wasn't JSON */
	}
	const hint: Record<number, string> = {
		401: 'You.com rejected YDC_API_KEY; check the key in frontend/.env',
		402: 'You.com account is out of credit',
		403: 'YDC_API_KEY lacks access to the Search API'
	};
	return `You.com search failed: HTTP ${res.status}. ${hint[res.status] ?? ''} ${detail}`.trim();
}

/** Tolerant of field-name drift: results.web[] (current), hits[] (legacy), or a bare results array. */
function parseResults(json: unknown): Raw[] {
	const j = (json ?? {}) as Record<string, any>;
	const lists = [j.results?.web, j.hits, j.web?.results, Array.isArray(j.results) ? j.results : undefined];
	const items: any[] = lists.filter(Array.isArray).flat();
	const out: Raw[] = [];
	for (const r of items) {
		if (!r || typeof r !== 'object') continue;
		const url = str(r.url ?? r.link ?? r.href);
		if (!url) continue;
		const c = (r.contents ?? {}) as Record<string, any>;
		const highlights = Array.isArray(c.highlights) ? c.highlights.filter((x: unknown) => typeof x === 'string') : [];
		const html = str(c.html);
		const text = str(c.markdown) || str(r.markdown) || highlights.join('\n') || (html ? stripHtml(html) : '');
		out.push({
			url,
			title: str(r.title ?? r.name),
			description: str(r.description ?? r.snippet),
			snippets: Array.isArray(r.snippets) ? r.snippets.filter((s: unknown) => typeof s === 'string') : [],
			text: cleanText(text).slice(0, 8000)
		});
	}
	return out;
}

// ---------------------------------------------------------------- filtering

const NOT_SF = /south san francisco|south-san-francisco|daly city|daly-city|oakland|berkeley|san mateo|san-mateo|burlingame|millbrae|alameda|emeryville|sausalito|pacifica|san bruno|brisbane|san jose|palo alto|redwood city/;
const NON_LISTING_HOSTS = /(^|\.)(reddit|sfgate|sfchronicle|wikipedia|yelp|medium|nytimes|youtube|curbed|sfist|quora|tiktok|instagram|facebook|nextdoor|linkedin|twitter|x|niche|bestplaces|tripadvisor|sf\.gov|sfplanning|census)\.(com|org|gov|net)$/;
const AGGREGATE_TITLE = /\b\d[\d,]*\+?\s+(?:apartments?|rentals?|homes|houses|listings|units|results)\b|\b(?:apartments|rentals|homes|houses|condos|studios|lofts) for rent\b|\bapartments (?:in|near)\b|\bcheap apartments\b|\bbest (?:apartments|neighborhoods)\b|\bguide\b/i;
const ADDRESS = /\b\d{1,5}\s+(?:[A-Z0-9][\w.'-]*\s+){0,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Way|Ter|Terrace|Pl|Place|Ct|Court|Dr|Drive|Rd|Road|Ln|Lane|Alley|Aly)\b/;

/** Per-site URL shapes for one unit or building (accept) vs search/neighborhood pages (reject). */
const URL_RULES: { host: RegExp; accept: RegExp; reject?: RegExp }[] = [
	{ host: /zillow\.com$/, accept: /\/homedetails\/|\/apartments\/san-francisco-ca\/[^/]+\/[A-Za-z0-9]+\/?$|^\/b\//, reject: /\/homes\/|\/rentals\/|_rb\/|\/for_rent\//i },
	{ host: /apartments\.com$/, accept: /^\/[^/]+\/(?=[a-z]*\d)[a-z0-9]{6,8}\/?$/ },
	{ host: /craigslist\.org$/, accept: /\/apa\/d\// },
	{ host: /trulia\.com$/, accept: /^\/(?:p|home|building)\//, reject: /\/for_rent\// },
	{ host: /hotpads\.com$/, accept: /\/(?:pad|building)\/?$/ },
	{ host: /zumper\.com$/, accept: /\/apartment-buildings\/p\d+|\/address\//, reject: /\/apartments-for-rent\// },
	{ host: /padmapper\.com$/, accept: /\/buildings\/p\d+|\/apartments\/\d+/, reject: /\/apartments\/san-francisco-ca\/?$/ },
	{ host: /redfin\.com$/, accept: /\/(?:home|apartment)\/\d+/, reject: /\/(?:city|neighborhood|zipcode)\// },
	{ host: /realtor\.com$/, accept: /\/rentals\/details\/|\/realestateandhomes-detail\//, reject: /\/apartments\/|\/realestateandhomes-search\// }
];

function classify(r: Raw): 'listing' | 'maybe' | 'reject' {
	let u: URL;
	try {
		u = new URL(r.url);
	} catch {
		return 'reject';
	}
	const host = u.hostname.replace(/^www\./, '').toLowerCase();
	const path = decodeURIComponent(u.pathname);
	const head = `${r.title} ${host}${path}`.toLowerCase();
	if (NON_LISTING_HOSTS.test(host) || /\/(?:blog|news|guides?|articles?)\//i.test(path)) return 'reject';
	if (NOT_SF.test(head) || /\bfor[ _-]sale\b|\bsold\b/i.test(head)) return 'reject';
	const all = `${head} ${r.description} ${r.snippets.join(' ')} ${r.text.slice(0, 3000)}`.toLowerCase();
	if (!/san francisco|san-francisco|sanfrancisco|sfbay|\bsf\b|\b941\d\d\b/.test(all)) return 'reject';

	const rule = URL_RULES.find((x) => x.host.test(host));
	// On a known listing site, any URL that isn't a per-unit/per-building shape is a search or filter page.
	if (rule) return rule.accept.test(path) && !rule.reject?.test(path) ? 'listing' : 'reject';
	if (AGGREGATE_TITLE.test(r.title) && !ADDRESS.test(r.title)) return 'reject';
	if (ADDRESS.test(r.title)) return 'listing';
	const summary = `${r.title} ${r.description} ${r.snippets.join(' ')}`;
	if (findPrice(summary, false) != null && findBedrooms(summary) != null) return 'listing';
	return 'maybe';
}

// ---------------------------------------------------------------- heuristics

function heuristics(r: Raw): { f: Fields; weakHood: Hood | null } {
	const head = `${r.title}\n${r.description}\n${r.snippets.join('\n')}`;
	const all = `${head}\n${r.text}`;
	let urlWords = '';
	try {
		urlWords = decodeURIComponent(new URL(r.url).pathname).replace(/[-_/+]+/g, ' ');
	} catch {
		/* keep empty */
	}
	const f: Fields = {
		price: findPrice(head, false) ?? findPrice(r.text, true),
		bedrooms: findBedrooms(head) ?? findBedrooms(r.text.slice(0, 2000)),
		bathrooms: findBathrooms(head) ?? findBathrooms(r.text.slice(0, 2000)),
		neighborhood: mapNeighborhood(r.title, false) ?? mapNeighborhood(urlWords, false) ?? mapNeighborhood(head, false) ?? zipHood(`${r.title} ${r.url} ${head}`),
		sqft: findSqft(all),
		floor: findFloor(all),
		layout: findLayout(all),
		laundry: findLaundry(all),
		parking: findParking(all),
		pets: findPets(all),
		street_noise: findNoise(all),
		available: findAvailable(all)
	};
	const weakHood = f.neighborhood ? null : zipHood(r.text) ?? mapNeighborhood(r.text.slice(0, 3000), true);
	return { f, weakHood };
}

const PRICE = /\$\s?(\d{1,2},\d{3}|\d{3,5})(?![\d,]*\d)(\s*\+)?(\s*(?:\/|per|a)\s*(?:mo\b|month)|\s*monthly)?/gi;

/** Monthly rent. In page text require a /mo cue, since pages also list deposits and fees. */
export function findPrice(text: string, needMonthly: boolean): number | null {
	let plain: number | null = null;
	for (const m of text.matchAll(PRICE)) {
		const n = Number(m[1].replace(/,/g, ''));
		if (n < 700 || n > 25_000) continue;
		const around = text.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + m[0].length + 20).toLowerCase();
		if (/deposit|fee|sale|income|salary|credit/.test(around)) continue;
		if (m[3]) return n;
		if (plain == null) plain = n;
	}
	return needMonthly ? null : plain;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

export function findBedrooms(text: string): number | null {
	// Building pages give a range ("Studio-2 Beds", "1-3 bd") next to the lowest price, so take the low end.
	const range = text.match(/\b(studio|\d)\s*(?:-|–|to)\s*\d\s*(?:bd|bds|beds?|bedrooms?|br)\b/i);
	if (range) return /studio/i.test(range[1]) ? 0 : Number(range[1]);
	const m = text.match(/\b(\d)\s*-?\s*(?:bd|bds|bed|beds|bedroom|bedrooms|br|bdrm|bdrms)\b/i);
	if (m) return Number(m[1]) <= 6 ? Number(m[1]) : null;
	const w = text.match(/\b(one|two|three|four|five)[- ](?:bed|bedroom|br)\b/i);
	if (w) return WORD_NUM[w[1].toLowerCase()];
	if (/\bstudio\b/i.test(text)) return 0;
	return null;
}

function findBathrooms(text: string): number | null {
	const m = text.match(/\b(\d(?:\.5)?)\s*-?\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i);
	const n = m ? Number(m[1]) : NaN;
	return n >= 1 && n <= 5 ? n : null;
}

function findSqft(text: string): number | null {
	const m = text.match(/\b(\d,\d{3}|\d{3,4})\s*(?:sq\.?\s*ft\.?|sqft|square feet|sf\b|ft²|ft2\b)/i);
	const n = m ? Number(m[1].replace(',', '')) : NaN;
	return n >= 150 && n <= 5000 ? n : null;
}

function findFloor(text: string): number | null {
	if (/\bground floor\b|\bgarden (?:level|unit)\b/i.test(text)) return 1;
	const m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)[- ]floor\b/i);
	const n = m ? Number(m[1]) : NaN;
	return n >= 1 && n <= 60 ? n : null;
}

function findLayout(text: string): Fields['layout'] {
	if (/\brailroad\b/i.test(text)) return 'railroad';
	if (/\bloft\b/i.test(text)) return 'loft';
	if (/\bopen[- ](?:floor ?plan|layout|concept)\b/i.test(text)) return 'open';
	return null;
}

function findLaundry(text: string): Fields['laundry'] {
	const t = text.toLowerCase();
	if (/in[- ]unit (?:laundry|washer|w\/d)|(?:washer|w\/d|washer\/dryer|washer and dryer) in[- ](?:unit|home|apartment)|in[- ]home laundry/.test(t)) return 'in_unit';
	if (/(?:shared|on[- ]site|coin|common|in[- ]building|laundry) (?:laundry|room|facilities)|laundry (?:in building|on[- ]site|on each floor)/.test(t)) return 'in_building';
	if (/\bno laundry\b|laundry:\s*none/.test(t)) return 'none';
	return null;
}

function findParking(text: string): boolean | null {
	const t = text.toLowerCase();
	if (/\bno parking\b|street parking only|parking:\s*(?:none|street)/.test(t)) return false;
	if (/(?:garage|off[- ]street|covered|assigned|deeded|private) parking|parking (?:included|available|space|spot|garage)|\b(?:1|one)[- ]car garage\b/.test(t)) return true;
	return null;
}

function findPets(text: string): Fields['pets'] {
	const t = text.toLowerCase();
	if (/\bno pets\b|pets not allowed|no animals/.test(t)) return 'none';
	const cats = /\bcats? (?:ok|allowed|welcome|friendly)|cat[- ]friendly|cats? are (?:ok|allowed|welcome)/.test(t);
	const dogs = /\bdogs? (?:ok|allowed|welcome|friendly)|dog[- ]friendly|dogs? are (?:ok|allowed|welcome)/.test(t);
	if ((cats && dogs) || /(?:cats? (?:and|&) dogs?|dogs? (?:and|&) cats?) (?:ok|allowed|welcome)|pets? (?:ok|allowed|welcome)|pet[- ]friendly/.test(t)) return 'both';
	if (cats) return 'cats';
	if (dogs) return 'dogs';
	return null;
}

function findNoise(text: string): Fields['street_noise'] {
	const t = text.toLowerCase();
	if (/\bquiet (?:street|block|building|neighborhood|residential)\b|tree[- ]lined/.test(t)) return 'quiet';
	if (/\bbusy (?:street|corridor)\b|\bnightlife\b|\bbustling\b/.test(t)) return 'lively';
	return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function findAvailable(text: string, today = new Date()): string | null {
	const t = text.toLowerCase();
	const iso = (y: number, m: number, d: number) => {
		const dt = new Date(Date.UTC(y, m, d));
		return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== d ? null : dt.toISOString().slice(0, 10);
	};
	if (/available (?:now|immediately|today)|move[- ]in ready|ready now/.test(t)) return today.toISOString().slice(0, 10);
	const m = t.match(/available(?: on| from| starting| date:?)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
	if (m) {
		const month = MONTHS.indexOf(m[1]);
		let year = m[3] ? Number(m[3]) : today.getUTCFullYear();
		if (!m[3] && month < today.getUTCMonth() - 1) year += 1;
		return iso(year, month, Number(m[2]));
	}
	const n = t.match(/available(?: on| from| starting| date:?)?\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
	if (n) {
		const month = Number(n[1]) - 1;
		let year = n[3] ? Number(n[3].length === 2 ? `20${n[3]}` : n[3]) : today.getUTCFullYear();
		if (!n[3] && month < today.getUTCMonth() - 1) year += 1;
		return iso(year, month, Number(n[2]));
	}
	return null;
}

// ---------------------------------------------------------------- neighborhoods

/**
 * Names (and nearby names) -> one of NEIGHBORHOODS. Order matters: specific names before the generic ones they
 * contain ("outer mission" and "mission bay" before "mission"). `weak` entries are skipped in page body text, where
 * nav menus and "nearby" lists mention many places.
 */
const ALIASES: [RegExp, Hood, 'weak'?][] = [
	[/\bouter mission\b|\bexcelsior\b|\bcrocker[- ]amazon\b|\bportola\b|\bingleside\b|\bvisitacion valley\b/, 'Excelsior'],
	[/\bmission bay\b|\bsouth of market\b|\bsoma\b|\bsouth beach\b|\brincon hill\b|\byerba buena\b|\bfinancial district\b|\bfidi\b/, 'SoMa'],
	[/\bmission dolores\b|\bmission district\b|\binner mission\b|\bthe mission\b|\bvalencia (?:st|street|corridor)\b/, 'Mission'],
	[/\bmission\b(?! st(?:reet)?\b)/, 'Mission', 'weak'],
	[/\bhayes valley\b/, 'Hayes Valley'],
	[/\btendernob\b|\btenderloin\b|\bcivic center\b|\bunion square\b/, 'Tenderloin'],
	[/\blower pac(?:ific)? heights\b|\bpac(?:ific)? heights\b|\bpresidio heights\b|\blaurel heights\b|\bjapantown\b/, 'Pacific Heights'],
	[/\bcow hollow\b|\bmarina district\b|\bthe marina\b/, 'Marina'],
	[/\bmarina\b/, 'Marina', 'weak'],
	[/\bnob hill\b|\bpolk gulch\b/, 'Nob Hill'],
	[/\brussian hill\b/, 'Russian Hill'],
	[/\bnorth beach\b|\btelegraph hill\b|\bchinatown\b|\bjackson square\b|\bfisherman'?s wharf\b/, 'North Beach'],
	[/\binner sunset\b|\bcole valley\b|\bparnassus\b|\bgolden gate heights\b/, 'Inner Sunset'],
	[/\bouter sunset\b|\bcentral sunset\b|\bsunset district\b|\bparkside\b/, 'Outer Sunset'],
	[/\binner richmond\b|\blaurel village\b|\blone mountain\b|\banza vista\b/, 'Inner Richmond'],
	[/\bouter richmond\b|\bcentral richmond\b|\bsea cliff\b/, 'Outer Richmond'],
	[/\brichmond district\b/, 'Inner Richmond', 'weak'],
	[/\bnoe valley\b|\bglen park\b|\bdiamond heights\b/, 'Noe Valley'],
	[/\bthe castro\b|\bcastro\b|\beureka valley\b|\bduboce triangle\b|\bcorona heights\b|\bdolores heights\b/, 'Castro'],
	[/\bbernal heights\b|\bbernal\b/, 'Bernal Heights'],
	[/\bpotrero hill\b|\bpotrero\b/, 'Potrero Hill'],
	[/\bdogpatch\b|\bcentral waterfront\b/, 'Dogpatch'],
	[/\blower haight\b|\balamo square\b|\bnopa\b|\bnorth (?:of )?panhandle\b|\bwestern addition\b|\bfillmore\b|\bhaight[- ]ashbury\b|\bupper haight\b/, 'Lower Haight'],
	[/\bhaight\b/, 'Lower Haight', 'weak']
];

export function mapNeighborhood(text: string | null | undefined, bodyText: boolean): Hood | null {
	if (!text) return null;
	const t = text.toLowerCase();
	const exact = NEIGHBORHOODS.find((n) => n.toLowerCase() === t.trim());
	if (exact) return exact;
	for (const [re, hood, weak] of ALIASES) {
		if (bodyText && weak) continue;
		if (re.test(t)) return hood;
	}
	return null;
}

/** ZIP -> the closest of our neighborhoods (approximate; several ZIPs span two of them). */
const ZIP_HOODS: Record<string, Hood> = {
	'94102': 'Tenderloin',
	'94103': 'SoMa',
	'94104': 'SoMa',
	'94105': 'SoMa',
	'94107': 'Potrero Hill',
	'94108': 'Nob Hill',
	'94109': 'Nob Hill',
	'94110': 'Mission',
	'94111': 'North Beach',
	'94112': 'Excelsior',
	'94114': 'Castro',
	'94115': 'Pacific Heights',
	'94117': 'Lower Haight',
	'94118': 'Inner Richmond',
	'94121': 'Outer Richmond',
	'94122': 'Inner Sunset',
	'94123': 'Marina',
	'94131': 'Noe Valley',
	'94133': 'North Beach',
	'94116': 'Outer Sunset',
	'94158': 'SoMa'
};

function zipHood(text: string): Hood | null {
	const m = text.match(/\b(941\d\d)\b/);
	return m ? ZIP_HOODS[m[1]] ?? null : null;
}

// ---------------------------------------------------------------- LLM normalization

type LlmRow = {
	id?: string;
	is_rental_listing?: boolean;
	in_san_francisco?: boolean;
	price?: number | null;
	bedrooms?: number | null;
	bathrooms?: number | null;
	sqft?: number | null;
	floor?: number | null;
	layout?: string | null;
	laundry?: string | null;
	parking?: boolean | null;
	pets?: string | null;
	street_noise?: string | null;
	available?: string | null;
	neighborhood?: string | null;
};

const SYSTEM = `You extract facts from San Francisco rental search results. Reply with JSON only: {"listings":[...]}, one object per input item, same "id".
Use null for anything the text does not state. Never guess.
Fields: id; is_rental_listing (true only for ONE specific unit or building for rent, not a search page, article or home for sale); in_san_francisco (city of San Francisco proper); price (monthly rent in USD, lowest if a range); bedrooms (0 = studio); bathrooms; sqft; floor; layout (${LAYOUTS.join('|')}); laundry (${LAUNDRY.join('|')}); parking (boolean); pets (${PETS.join('|')}); street_noise (${NOISE.join('|')}); available (YYYY-MM-DD); neighborhood (exactly one of: ${NEIGHBORHOODS.join(', ')}; if the listing names another SF neighborhood use the nearest of these; null if unknown).`;

async function llmNormalize(candidates: Candidate[]): Promise<void> {
	const needs = candidates
		.filter((c) => c.verdict === 'maybe' || c.f.price == null || c.f.bedrooms == null || c.f.neighborhood == null || c.f.laundry == null || c.f.pets == null)
		.sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === 'listing' ? -1 : 1))
		.slice(0, LLM_MAX_CANDIDATES);
	const batches: Candidate[][] = [];
	for (let i = 0; i < needs.length; i += LLM_BATCH) batches.push(needs.slice(i, i + LLM_BATCH));
	const today = new Date().toISOString().slice(0, 10);
	let done = 0;

	const work = async (batch: Candidate[]) => {
		const items = batch.map((c) => ({
			id: c.id,
			url: c.raw.url,
			title: c.raw.title.slice(0, 200),
			summary: [c.raw.description, ...c.raw.snippets].join(' ').slice(0, 700),
			page_excerpt: c.raw.text.slice(0, 1500)
		}));
		try {
			const { data } = await chatJSON<{ listings?: LlmRow[] } | LlmRow[]>(
				'normalizer',
				SYSTEM,
				`Today is ${today}.\n${JSON.stringify(items)}`,
				{ maxTokens: 3000 }
			);
			const rows = Array.isArray(data) ? data : Array.isArray(data?.listings) ? data.listings : [];
			for (const row of rows) {
				const c = batch.find((x) => x.id === row?.id);
				if (c) merge(c, row);
			}
		} catch (e) {
			console.error(`youcom: normalizer batch failed (${(e as Error).message}); keeping heuristic fields`);
		}
		done++;
		console.error(`youcom: normalized ${done}/${batches.length} batches`);
	};

	const queue = [...batches];
	await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, async () => {
		for (let b = queue.shift(); b; b = queue.shift()) await work(b);
	}));
}

/** LLM fills only what the heuristics left null; enums and ranges are re-validated. */
function merge(c: Candidate, row: LlmRow): void {
	if (row.is_rental_listing === false || row.in_san_francisco === false) {
		c.f.price = null; // drops it in fetchAll
		return;
	}
	if (c.verdict === 'maybe' && row.is_rental_listing === true) c.verdict = 'listing';
	const f = c.f;
	f.price ??= num(row.price, 700, 25_000);
	f.bedrooms ??= int(row.bedrooms, 0, 6);
	f.bathrooms ??= num(row.bathrooms, 1, 5);
	f.sqft ??= int(row.sqft, 150, 5000);
	f.floor ??= int(row.floor, 1, 60);
	f.layout ??= oneOf(row.layout, LAYOUTS);
	f.laundry ??= oneOf(row.laundry, LAUNDRY);
	f.parking ??= typeof row.parking === 'boolean' ? row.parking : null;
	f.pets ??= oneOf(row.pets, PETS);
	f.street_noise ??= oneOf(row.street_noise, NOISE);
	f.available ??= typeof row.available === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.available) ? row.available : null;
	f.neighborhood ??= mapNeighborhood(row.neighborhood, false);
	if (c.verdict === 'maybe') f.price = null; // LLM didn't confirm it's a listing
}

// ---------------------------------------------------------------- small helpers

function str(x: unknown): string {
	return typeof x === 'string' ? x.trim() : '';
}

function num(x: unknown, lo: number, hi: number): number | null {
	const n = typeof x === 'string' ? Number(x.replace(/[$,]/g, '')) : x;
	return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

function int(x: unknown, lo: number, hi: number): number | null {
	const n = num(x, lo, hi);
	return n == null ? null : Math.round(n);
}

function oneOf<T extends string>(x: unknown, allowed: readonly T[]): T | null {
	return typeof x === 'string' && (allowed as readonly string[]).includes(x) ? (x as T) : null;
}

function canonicalUrl(raw: string): string | null {
	try {
		const u = new URL(raw);
		u.hash = '';
		for (const k of [...u.searchParams.keys()]) if (/^utm_|^(?:ref|src|source|fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
		u.hostname = u.hostname.toLowerCase();
		if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
		return u.toString();
	} catch {
		return null;
	}
}

function idFor(url: string): string {
	return `ydc_${createHash('sha256').update(url).digest('hex').slice(0, 8)}`;
}

function cleanTitle(t: string): string {
	const s = t
		.replace(/\s*[|\-–—]\s*(?:zillow|trulia|hotpads|apartments\.com|zumper|redfin|realtor\.com|craigslist|padmapper|rent\.com|apartment list|rentcafe)\b.*$/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	return (s || t).slice(0, 140);
}

function cleanText(md: string): string {
	return md
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function stripHtml(html: string): string {
	return html
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}
