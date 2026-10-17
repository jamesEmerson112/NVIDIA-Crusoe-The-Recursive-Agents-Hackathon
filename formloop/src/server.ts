// Demo server: two-pane page (editable form | live listing cards) over the same agent and matcher.
//   npm run serve   then open http://localhost:5190
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEvalConfig, loadQuestionBank } from './research.ts';
import { ensureV1, latestForm, loadForm } from './forms.ts';
import { loadListings } from './listings.ts';
import { hasCrusoeKey, usageLog } from './crusoe.ts';
import { extractWithFactors, prefFromReaction, type FoundFactor } from './agent.ts';
import { ydcCacheOnly } from './ydc.ts';
import { rank, satisfaction, utility, violates } from './utility.ts';
import { DEST_LABEL } from './phrases.ts';
import { proposeFollowups } from './followups.ts';
import { listingPlan } from './plan3d.ts';
import { formloopDir } from './config.ts';
import { logsDir } from './outer.ts';
import type { Answer, Listing, Pref, Question } from './types.ts';

const PORT = Number(process.env.PORT ?? 5190);
const cfg = loadEvalConfig();
const bank = loadQuestionBank();
ensureV1(bank, cfg);
const listings = await loadListings(cfg);
const live = hasCrusoeKey();
const page = join(formloopDir, 'web', 'index.html');

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const list = (v: Pref['value']) => (Array.isArray(v) ? v.map(String) : [String(v)]);

function prefLabel(p: Pref): string {
	const v = p.value;
	if (p.factor) return `${p.factor.text}${p.field === 'neighborhood' && Array.isArray(v) ? ` → ${v.join(', ')}` : ''}`;
	switch (p.field) {
		case 'price': return p.op === 'max' ? `rent ≤ ${money(Number(v))}` : `rent ≥ ${money(Number(v))}`;
		case 'commute': return `≤ ${v} min to ${DEST_LABEL[p.dest ?? 'fidi']}`;
		case 'bedrooms': return Number(v) === 0 ? 'studio or bigger' : `${p.op === 'min' ? '≥' : '≤'} ${v} bedrooms`;
		case 'sqft': return `${p.op === 'min' ? '≥' : '≤'} ${v} sq ft`;
		case 'available': return p.op === 'max' ? `available by ${v}` : `available after ${v}`;
		case 'floor': return `floor ${p.op === 'min' ? '≥' : '≤'} ${v}`;
		case 'parking': return v === true ? 'parking' : 'no parking needed';
		case 'pets': return `allows ${list(v).join(' + ')}`;
		case 'laundry': return list(v).length === 1 ? 'in-unit laundry' : 'laundry in unit or building';
		case 'street_noise': return `${p.op === 'not_in' ? 'not ' : ''}${list(v).join('/')} street`;
		case 'layout': return `${p.op === 'not_in' ? 'no ' : ''}${list(v).join('/')} layout`;
		case 'neighborhood': return `${p.op === 'not_in' ? 'not in' : 'in'} ${list(v).join(', ')}`;
	}
}

function card(l: Listing, prefs: Pref[]) {
	const checks = prefs.map((p) => ({ label: prefLabel(p), sat: satisfaction(l, p), hard: Boolean(p.hard), from: p.from, sources: p.factor?.sources }));
	return { listing: l, utility: Number(utility(l, prefs).toFixed(3)), checks };
}

// Model calls are slow and cost credits, so the page reuses results for identical inputs.
const prefCache = new Map<string, { prefs: Pref[]; factors: FoundFactor[] }>();
const reactionCache = new Map<string, Pref | null>();

function formFor(version?: number) {
	const f = version ? loadForm(version) : latestForm(bank, cfg);
	const questions = f.questions.slice(0, cfg.questions_shown);
	// The rest of the bank, offered as optional extra fields on the page.
	const extra = bank.filter((q) => !questions.some((x) => x.id === q.id));
	return { ...f, questions, extra };
}

type Body = { offline?: boolean; version?: number; answers?: Answer[]; followups?: Question[]; ranking?: string[]; reactions?: { listing_id: string; liked: boolean; reason?: string }[] };

/** Every question the page may show: the form version, extra bank fields and this visitor's follow-ups. */
function allQuestions(body: Body): Question[] {
	const form = formFor(body.version);
	// fu_ = agent-written follow-ups, own_ = questions the renter wrote themselves.
	const followups = (body.followups ?? []).filter((q) => q && typeof q.id === 'string' && /^(fu|own)_/.test(q.id) && Array.isArray(q.maps_to));
	return [...form.questions, ...form.extra, ...followups];
}

async function recommend(body: Body) {
	const form = formFor(body.version);
	// Rewritten questions travel with their answers, so the agent reads the renter's wording.
	const questions = allQuestions(body);
	const answers = (body.answers ?? []).filter((a) => questions.some((q) => q.id === a.question_id));
	// Demo mode forces rules + cache-only so every step works with the network off.
	const useLive = live && !body.offline;
	const key = JSON.stringify([useLive, answers.map((a) => [a.question_id, a.action, a.value, a.rewritten_text, a.importance])]);
	let mode: 'live' | 'offline' = useLive ? 'live' : 'offline';
	let extracted = prefCache.get(key);
	if (!extracted) {
		// The page may ground new factors live (cache first); YDC_CACHE_ONLY=1 keeps it offline for the demo.
		try {
			extracted = await extractWithFactors(questions, answers, { offline: !useLive, cacheOnly: !useLive || ydcCacheOnly() });
		} catch (e) {
			console.warn(`extractor failed, using rules: ${(e as Error).message}`);
			extracted = await extractWithFactors(questions, answers, { offline: true, cacheOnly: true });
			mode = 'offline';
		}
		prefCache.set(key, extracted);
	}
	const { prefs, factors } = extracted;
	const passed = new Set<string>();
	const liked: Listing[] = [];
	const fromReactions: Pref[] = [];
	for (const r of body.reactions ?? []) {
		const l = listings.find((x) => x.id === r.listing_id);
		if (!l) continue;
		if (r.liked) {
			liked.push(l);
			continue;
		}
		passed.add(l.id);
		if (!r.reason?.trim()) continue;
		const rk = `${useLive}|${l.id}|${r.reason}`;
		if (!reactionCache.has(rk)) {
			try {
				reactionCache.set(rk, await prefFromReaction(r.reason, l, { offline: !useLive }));
			} catch {
				reactionCache.set(rk, await prefFromReaction(r.reason, l, { offline: true }));
			}
		}
		const p = reactionCache.get(rk);
		if (p) fromReactions.push(p);
	}
	const all = [...prefs, ...fromReactions];
	const exclude = new Set([...passed, ...liked.map((l) => l.id)]);
	const ranked = rank(listings, all, exclude);
	const hard = all.filter((p) => p.hard);
	const remaining = listings.filter((l) => !exclude.has(l.id) && !hard.some((p) => violates(l, p))).length;
	return {
		mode,
		form: form.version,
		prefs: all.map((p) => ({ ...p, label: prefLabel(p) })),
		// How much each answered question revealed the renter cares (max weight of its preferences).
		factors: factors.map((f) => ({ text: f.factor, status: f.status, from: f.from, neighborhoods: f.neighborhoods, rule: f.rule && prefLabel(f.rule), sources: f.sources, reason: f.reason })),
		weights: Object.fromEntries([...new Set(prefs.map((p) => p.from).filter(Boolean) as string[])].map((id) => [id, Math.max(...prefs.filter((p) => p.from === id).map((p) => p.weight))])),
		top: ranked.slice(0, cfg.top_k).map((l) => card(l, all)),
		liked: liked.map((l) => card(l, all)),
		// Fit of every listing for the map: utility 0..1, -1 = breaks a dealbreaker, null = passed/liked already.
		fits: Object.fromEntries(listings.map((l) => [l.id, exclude.has(l.id) ? null : Number(utility(l, all).toFixed(3))])),
		remaining,
		total: listings.length,
		calls: usageLog.length,
		cost: Number(usageLog.reduce((a, u) => a + u.cost, 0).toFixed(4))
	};
}

/** Real visitors' reactions go to the same log the reviewer learns from. */
function logSubmission(body: Body) {
	mkdirSync(logsDir, { recursive: true });
	const at = new Date().toISOString();
	const rank = new Map((body.ranking ?? []).map((id, i) => [id, i + 1]));
	const lines = (body.answers ?? []).map((a) => JSON.stringify({ at, generation: 'ui', form: body.version, persona: 'web', rank: rank.get(a.question_id), ...a }));
	if (lines.length) appendFileSync(join(logsDir, 'ui_reactions.jsonl'), lines.join('\n') + '\n');
}

async function readJSON(req: IncomingMessage) {
	let data = '';
	for await (const chunk of req) data += chunk;
	return data ? JSON.parse(data) : {};
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
	res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
	res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
}

createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
		if (req.method === 'GET' && url.pathname === '/') return send(res, 200, readFileSync(page, 'utf8'), 'text/html; charset=utf-8');
		// A listing as a 3D blueprint in James's Plan format (frontend/src/lib/floorplan/types.ts), for his three.js viewer.
		const planMatch = url.pathname.match(/^\/api\/plan\/([\w-]+)$/);
		if (req.method === 'GET' && planMatch) {
			const l = listings.find((x) => x.id === planMatch[1]);
			if (!l) return send(res, 404, { error: `no listing ${planMatch[1]}` });
			res.setHeader('Access-Control-Allow-Origin', '*');
			return send(res, 200, listingPlan(l));
		}
		if (req.method === 'GET' && url.pathname === '/plans')
			return send(res, 200, readFileSync(join(formloopDir, 'web', 'plans.html'), 'utf8'), 'text/html; charset=utf-8');
		if (req.method === 'GET' && url.pathname === '/floorplan.js')
			return send(res, 200, readFileSync(join(formloopDir, 'web', 'floorplan.js'), 'utf8'), 'text/javascript; charset=utf-8');
		if (req.method === 'GET' && url.pathname === '/api/form') {
			const v = url.searchParams.get('version');
			const form = formFor(v ? Number(v) : undefined);
			return send(res, 200, { ...form, mode: live ? 'live' : 'offline', listings: listings.length, top_k: cfg.top_k });
		}
		if (req.method === 'GET' && url.pathname === '/api/listings')
			return send(res, 200, listings.map((l) => ({ id: l.id, neighborhood: l.neighborhood, price: l.price, bedrooms: l.bedrooms, title: l.title })));
		if (req.method === 'POST' && url.pathname === '/api/recommend') return send(res, 200, await recommend(await readJSON(req)));
		if (req.method === 'POST' && url.pathname === '/api/followups') {
			const body = (await readJSON(req)) as Body;
			const questions = allQuestions(body);
			const passes = (body.reactions ?? []).filter((r) => !r.liked && r.reason).map((r) => r.reason!);
			const followups = await proposeFollowups(
				{ questions, answers: body.answers ?? [], ranking: body.ranking ?? questions.map((q) => q.id), passes, bank },
				{ offline: !live }
			);
			return send(res, 200, { followups, calls: usageLog.length });
		}
		if (req.method === 'POST' && url.pathname === '/api/submit') {
			logSubmission(await readJSON(req));
			return send(res, 200, { ok: true });
		}
		send(res, 404, { error: 'not found' });
	} catch (e) {
		console.error(e);
		send(res, 500, { error: (e as Error).message });
	}
}).listen(PORT, () => {
	console.log(`formloop demo on http://localhost:${PORT} · ${listings.length} listings · ${live ? 'live Crusoe models' : 'OFFLINE rule-based agent'}`);
});
