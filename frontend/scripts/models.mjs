// Check the Crusoe API key and the configured model IDs against GET /v1/models,
// which is the source of truth for IDs and supported parameters (skill §5).
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Same loader as SvelteKit, so this sees exactly what the app sees (shell env wins over .env).
const env = loadEnv('development', root, '');
const key = env.CRUSOE_API_KEY;
const configured = {
	CRUSOE_AGENT_MODEL: env.CRUSOE_AGENT_MODEL || 'zai-org/GLM-5.3-Flash',
	CRUSOE_FAST_MODEL: env.CRUSOE_FAST_MODEL || 'deepseek-ai/Deepseek-V4-Flash'
};

if (!key || key === 'paste-your-key-here') {
	console.error('CRUSOE_API_KEY is not set. Run: npm run set-key');
	process.exit(1);
}

const res = await fetch('https://api.inference.crusoecloud.com/v1/models', {
	headers: { Authorization: `Bearer ${key}` }
});
if (!res.ok) {
	console.error(`GET /v1/models failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
	if (res.status === 401 || res.status === 403) {
		console.error(
			`The key was rejected (${key.length} characters, ending …${key.slice(-4)}). Check it matches the console, ` +
				'has not expired, and belongs to the right project. If it contains $, re-run npm run set-key.'
		);
	}
	process.exit(1);
}

const { data } = await res.json();
// /v1/models reports pricing in USD per 1M tokens, as strings.
const per1M = (p) =>
	p === undefined || p === null || p === '' ? '—' : `$${Number(p).toFixed(3).replace(/0$/, '')}`;
console.log(`Key OK. ${data.length} models available:\n`);
console.log(['id', 'context', 'modality', 'tools', 'in / cached / out per 1M'].join('\t'));
for (const m of [...data].sort((a, b) => a.id.localeCompare(b.id))) {
	const params = m.supported_parameters ?? [];
	console.log(
		[
			m.id,
			m.context_length ?? '—',
			m.architecture?.modality ?? '—',
			params.includes('tools') ? 'yes' : 'no',
			`${per1M(m.pricing?.prompt)} / ${per1M(m.pricing?.input_cache_reads)} / ${per1M(m.pricing?.completion)}`
		].join('\t')
	);
}

console.log('\nConfigured models:');
let ok = true;
for (const [name, id] of Object.entries(configured)) {
	const m = data.find((x) => x.id === id);
	const near = data.filter((x) => x.id.toLowerCase() === id.toLowerCase()).map((x) => x.id);
	if (!m) {
		ok = false;
		console.log(
			`  ✗ ${name}=${id} not found${near.length ? ` (did you mean ${near.join(', ')}? IDs are case-sensitive)` : ''}`
		);
	} else if (!(m.supported_parameters ?? []).includes('tools')) {
		ok = false;
		console.log(`  ✗ ${name}=${id} exists but does not list "tools" in supported_parameters`);
	} else {
		console.log(`  ✓ ${name}=${id}`);
	}
}
process.exit(ok ? 0 : 1);
