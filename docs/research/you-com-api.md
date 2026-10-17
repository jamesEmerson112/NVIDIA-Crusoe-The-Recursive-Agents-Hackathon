# You.com API for Workbench

Research date: 2026-10-17. Scope: which You.com APIs exist now, what our $10 of credit buys, and how to give the Workbench agent real web data for the "find me a home in SF" demo (listings, neighborhood facts, citations) and for the planned `spawn_research` fan-out.
Labels: [official docs] [code/repo] [measured] (= 4 real calls this session, about $0.03 total) [inference].

## TL;DR

- **Four REST APIs matter: Search, Contents, Answer and Research.** Search returns ranked web and news results and costs $5 per 1k calls. Contents returns the text of URLs you already have, $1 per 1k pages. Answer does one search pass and returns a cited answer, $5 per 1k. Research runs several searches and returns a cited report, from $12 per 1k (`lite`) to $1,200 per 1k (`frontier`) [official docs]. The old Express and Advanced "agents" don't appear in the current docs index [official docs].
- **$10 buys about 2,000 searches or Answer calls, about 830 Research `lite` calls, or 10,000 Contents pages** [official docs]. A 4-way fan-out with one Research `lite` call per sub-agent costs about $0.05, so credit is not the constraint today [inference].
- **To get listings, call Search with `include_domains` set to listing sites, `freshness: month` and `extraction_mode: highlights`.** That call returned 7 results in about 1.0 s. 5 had a street address, 4 of those looked like rental unit or building pages, and one showed a price ("Sunset Towers, 8 Locksley Ave ... 1 bedroom rental starting at $4,969/month"). The same query without those options returned only aggregate search pages ("37 Rentals") [measured].
- **For neighborhood facts with citations, use Research `lite`.** It returned 9 sources and numbered citations in 5.2 s. Answer was faster (3.7 s) but cited one source for three different claims [measured].
- **Recommended tools:** `search_listings` (Search) and `research` (Research `lite`, with Answer as a cheaper verify mode). `spawn_research` gives each sub-agent one `research` call. Details are in §3.

## 1. APIs available now [official docs]

All endpoints take `POST`, a JSON body and an `X-API-Key` header. Note that they live on two different hosts.

| API | Endpoint | Key params | Response | Price | Latency |
|---|---|---|---|---|---|
| Web Search | `https://ydc-index.io/v1/search` | `query`, `count` (default 10, max 100 results per call per billing page), `offset` 0–9, `freshness` (`day`/`week`/`month`/`year`/`YYYY-MM-DDtoYYYY-MM-DD`), `country`, `language`, `safesearch`, `include_domains` (≤500, strict allowlist) / `exclude_domains` / `boost_domains`, `strict_operators`, `extraction`, `crawl_timeout` 1–60 s | `results.web[]`: `url, title, description, snippets[], page_age, thumbnail_url, favicon_url, contents{markdown,html,highlights}`; `results.news[]`; optional `results.knowledge[]`; `metadata{search_uuid, query, latency}` | $5 / 1k calls; news included | Fastest; no figure given |
| Search `extraction` | same | `extraction_mode: highlights` (`total_max_tokens` 1024–8192) or `full_page` (`extraction_source` `blend`/`cache`/`fetch`, `extraction_formats` markdown/html) | text goes in `contents` | `cache` free; `fetch` costs $1 / 1k pages; `blend` costs $1 / 1k for pages it crawls live. No highlights surcharge is listed | adds crawl time |
| Contents | `https://ydc-index.io/v1/contents` | `urls[]`, `formats` (`html`/`markdown`/`metadata`), `crawl_timeout`, `max_age` | array of `{url, title, html, markdown, metadata{site_name, favicon_url}}` | $1 / 1k pages | up to `crawl_timeout` per URL (default 10 s) |
| Answer | `https://api.you.com/v1/answer` | `query`, `freshness`, `country`, `language`, `safesearch`, domain lists | `answer` (Markdown with `[[1, 2]]` markers), `citations[]{source, excerpts[]}`, `results.web[]` | $5 / 1k calls | p50 2.67 s |
| Research | `https://api.you.com/v1/research` | `input` (≤40k chars), `research_effort` `lite`/`standard`/`deep`/`exhaustive`/`frontier`, `source_control` (beta: domains, `freshness`, `country`), `output_schema` (beta, not on `lite`), `background` | `output{content, content_type, sources[]{url, title, snippets}}`, `warnings[]`; background returns `task_id` to poll or stream | $12 / $50 / $100 / $450 / $1,200 per 1k | <10 s / 10–30 s / <120 s / <300 s / 30 s–12,000 s |
| Finance Research | `/v1/finance_research` | `deep`/`exhaustive` | same as Research | $110 / $500 per 1k | not relevant to us |

- **Deprecated:** `livecrawl` and `livecrawl_formats` on Search; use `extraction` instead. `GET /v1/search` still works but gets no new features, and `extraction` is POST-only. The `@youdotcom-oss/sdk` npm package is deprecated; plain `fetch` is the recommended path for TypeScript [official docs].
- **MCP:** `https://api.you.com/mcp` (plus `/mcp/research`) takes `Authorization: Bearer`. A keyless `?profile=free` profile gives `you-search` and `you-discover`; the pricing page says the free tier allows up to 100 queries a day [official docs]. This is a fallback if credit runs out, but our agent calls tools server-side, so REST is simpler [inference].
- **Rate limits:** 10 requests/s each for Search, Contents, Answer and Research on self-serve accounts. On 429, honour `Retry-After` and back off exponentially [official docs]. Crusoe's 30 RPM per model will throttle us long before this [inference].

## 2. What $10 buys, and a budget for today

| Endpoint | Calls per $10 | Typical use per demo run |
|---|---|---|
| Search (snippets or highlights) | 2,000 | 1–4 listing searches |
| Search + `full_page` `fetch`, `count` 10 | ~666 (each call costs $0.005 + 10 × $0.001) | avoid; use highlights or `cache` |
| Contents | 10,000 pages | 0–5 listing detail pages |
| Answer | 2,000 | 1–3 claim checks |
| Research `lite` | ~830 | 1 per sub-agent brief |
| Research `standard` / `deep` | 200 / 100 | not needed for the demo |

**Suggested split [inference]:** $1 for development and testing (about 200 searches), $2 for rehearsals and the live demo, and $7 kept in reserve. One full demo run might take 4 sub-agents × (1 Research `lite` + 1 Search), plus 2 Answer checks, for about $0.08. Even 50 rehearsals stay under $5. Cache every response by query hash, as formloop does, so a repeated demo prompt costs nothing and replays deterministically.

## 3. Uses for us, ranked by demo value

1. **Live SF rental listings for a neighborhood and price band: Search.** This directly fills the gap where the agent invents listings.
   - Tool `search_listings({ neighborhood, bedrooms?, max_price?, count? })`.
   - Server builds the query as `"{bedrooms} bedroom apartment for rent {neighborhood} San Francisco"`, with `include_domains` set to the listing hosts formloop already knows (zillow, apartments.com, craigslist.org, trulia, hotpads, zumper, padmapper, redfin, realtor), `freshness: 'month'`, `country: 'US'` and `extraction: { extraction_mode: 'highlights', highlights: { total_max_tokens: 1024 } }` [measured that this returns unit pages].
   - Parse price and bedrooms from title, description and highlights with formloop's exported `findPrice` and `findBedrooms` (`formloop/src/sources/youcom.ts`). Drop aggregate pages with its `URL_RULES`/`AGGREGATE_TITLE` patterns (not exported yet) [code/repo].
   - `include_domains` cuts the noise but doesn't remove it: 2 of 7 results were still aggregate pages and 1 was a Trulia home-value page. Keep formloop's classifier layer on top [measured].
   - Returns `[{ id, url, host, title, address?, price?, bedrooms?, page_age, snippet }]`. The UI renders these as cards with a source link and "seen {page_age}". Filter out results over `max_price` on the server; don't trust the query alone.
2. **Neighborhood brief (transit, safety, amenities, typical rent) with citations: Research `lite`.**
   - Tool `research({ question, neighborhood?, mode: 'brief' | 'verify' })`.
   - `brief` calls Research `lite`, optionally with `source_control.freshness: 'year'`. `verify` calls Answer (cheaper and faster).
   - Returns `{ answer_markdown, sources: [{ n, url, title, excerpt }], warnings }`. Convert `[[1, 2]]` into numbered links when the agent writes a markdown artifact. Keep `sources` in the tool result so the self-check can confirm every cited URL came from a tool.
3. **`spawn_research` fan-out.** Each sub-agent brief ("Inner Sunset, 1BR, under $3,800, commute to SoMa") makes one `research` call, plus optionally one `search_listings` call. Each sub-agent then summarizes with a cheap Crusoe model and returns `{ neighborhood, summary, rent_range, listings[], sources[] }`. The orchestrator merges these into one comparison artifact. Cost is about $0.02 per sub-agent, and latency is about 5 s for You.com plus the model's time [measured latency][inference cost].
4. **Market context (median rents, news): Search with `freshness: 'week'`** (news comes back in `results.news[]` at no extra cost) or Answer. Present rents as a range with sources: for Inner Sunset 1BR, sources gave $3,095 to $4,847 [measured].
5. **Verifying agent claims.** Extend `checkFinalAnswer` so any dollar figure or venue in a final reply must trace to a tool `sources[]` entry, or the reply gets labelled "unverified". Calling Answer per claim is possible but adds about 3–4 s each [inference].
6. **Listing detail page: Contents** with `formats: ['markdown', 'metadata']`, for when the user opens one listing. Cheap at $0.001 per page, but expect up to 10 s per page [official docs].

**Context hygiene [inference].**
- Tool results are appended to history and become part of the cached prefix. Truncate snippets to about 300 characters and return at most 8 listings, or 20 Search results with highlights blow up the context.
- Tool schema order is part of the cached prefix (see CLAUDE.md). Append `search_listings` and `research` at the end of `tools.ts`, and expect one cache miss on the first turn after deploying.

## 4. Gotchas

- **Auth:** REST uses the `X-API-Key` header, not Bearer. MCP uses `Authorization: Bearer`. Search and Contents are on `ydc-index.io`; Answer and Research are on `api.you.com` [official docs][measured].
- **Env var name:** the key is `YDC_API_KEY` in `frontend/.env`, the name formloop reads (`formloop/src/sources/youcom.ts:67`, `formloop/README.md`). Use the same name in the Workbench server code so one key serves both [code/repo].
- **Plain search returns search-results pages.** Without `include_domains` and highlights, all 10 results were aggregate or search pages (the Craigslist hit was a search URL too). One example is "Apartments For Rent in Inner Sunset - 37 Rentals" [measured]. Formloop works around this with URL rules and an LLM normalizer [code/repo].
- **Rate-limit headers were missing.** The docs say every response carries `X-RateLimit-*`, but all 4 responses returned none [measured]. Back off on 429 with `Retry-After`, as formloop's `request()` already does [code/repo].
- **Answer can over-cite one source.** It attributed rent, crime rate and transit claims all to niche.com, even though 20 results were retrieved [measured]. Prefer Research for anything shown as fact, and show sources next to numbers.
- **Freshness:** `page_age` is missing on some results. With `freshness: 'month'`, one result still had `page_age` 2026-04-01, so the filter does not guarantee recent pages [measured]. Listings go stale fast, so show the date and label results "as indexed by You.com", not "available now" [inference].
- **Extraction cost:** `full_page` with `fetch` or `blend` can multiply the cost of a call by up to 5× at `count` 20. `extraction_source: 'cache'` is free but returns content only for pages already cached [official docs].
- **Errors:** 401 means a bad key, 402 means out of credit (the body includes `upgrade_url`, `limit`, `used`), 403 means the key lacks scope, and 422 means an invalid parameter combination, such as `include_domains` with `exclude_domains` [official docs]. Formloop retries a 400/422 without `extraction` [code/repo].
- **Terms:** You.com's public website terms ban scraping its Services except via an API key, and ban using its name or logos without permission. They have no API-specific display or caching clause; the MSA wasn't reviewed [official docs]. Listing text belongs to third parties. Keep caches gitignored, as formloop does, store URLs and parsed fields rather than page text, and always link back to the source [code/repo][inference].
- **Latency [measured]:** Search 1.0–1.25 s wall clock (`metadata.latency` 0.43–0.72 s), Answer 3.7 s, Research `lite` 5.2 s. Run fan-out calls in parallel; 10 rps leaves plenty of headroom.
- **Never log the key.** Load `YDC_API_KEY` server-side from `$env/static/private` (or `dynamic/private`) in SvelteKit and keep it out of tool results and `usage` rows [inference].

## 5. Measured calls (2026-10-17, from this machine)

| # | Call | HTTP | Wall time | What came back |
|---|---|---|---|---|
| 1 | Search, "1 bedroom apartment for rent Inner Sunset San Francisco", `count` 10 | 200 | 1,245 ms | 10 web results (`url, title, description, snippets[4], page_age, thumbnail_url, favicon_url`), no news; all aggregate or search pages |
| 2 | Same + `include_domains` (8 listing hosts), `freshness: month`, highlights 1,024 tokens | 200 | 1,043 ms | 7 results with `contents.highlights`: 5 with a street address (4 rental unit or building pages, 1 home-value page) and 2 aggregates; 1 visible $/month price |
| 3 | Answer, rent + safety + transit question | 200 | 3,736 ms | 478-char answer, 1 citation, 20 `results.web` |
| 4 | Research `lite`, Inner Sunset renter brief | 200 | 5,165 ms | 685-char Markdown, 9 sources, `warnings: []` |

## Sources

- Search reference: https://you.com/docs/api-reference/search/v1-search
- Contents reference: https://you.com/docs/api-reference/contents.md
- Answer reference: https://you.com/docs/api-reference/answer/v1-answer.md
- Research reference: https://you.com/docs/api-reference/research/v1-research
- Choosing an API (latency, MCP, SDK status): https://you.com/docs/choose-the-right-api.md
- Billing (extraction surcharges, Research tiers): https://you.com/docs/administration/billing
- Pricing page ($10 = 2,000 searches, free MCP tier): https://you.com/pricing
- Rate limits: https://you.com/docs/rate-limits.md
- Docs index: https://you.com/docs/llms.txt ; website terms: https://you.com/legal/terms
- Repo: `formloop/src/sources/youcom.ts`, `formloop/README.md`, `docs/possible-technical-features.txt`
