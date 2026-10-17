<script lang="ts">
	// petite-vue's package exports hide dist/, so import the IIFE build by path as raw text:
	// it is inlined into each widget's srcdoc because the sandbox has no network.
	import runtime from '../../../node_modules/petite-vue/dist/petite-vue.iife.js?raw';
	import type { WidgetSpec } from '#lib/types.ts';

	let {
		spec,
		initial = null,
		live,
		onsubmit,
		title
	}: {
		spec: WidgetSpec;
		/** Last submitted data; the widget reads it as `$initial`. */
		initial?: Record<string, unknown> | null;
		/** Interactive. When false the widget shows its submitted state and ignores input. */
		live: boolean;
		onsubmit: (data: Record<string, unknown>) => void;
		title: string;
	} = $props();

	let frame: HTMLIFrameElement | undefined = $state();
	let height = $state(120);
	let error = $state('');

	// Plain elements look like the app's controls; light and dark follow the OS like the app.
	const BASE_CSS = `
:root { color-scheme: light dark; --fg: #18181b; --muted: #71717a; --line: #d4d4d8; --bg: #fff; --soft: #f4f4f5; --accent: #047857; }
@media (prefers-color-scheme: dark) { :root { --fg: #f4f4f5; --muted: #a1a1aa; --line: #3f3f46; --bg: #18181b; --soft: #27272a; --accent: #34d399; } }
html, body { margin: 0; background: transparent; color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
body { padding: 2px; }
* { box-sizing: border-box; }
h1, h2, h3, h4 { margin: 0 0 .5em; line-height: 1.25; } h1 { font-size: 1.25em; } h2 { font-size: 1.1em; } h3, h4 { font-size: 1em; }
p { margin: 0 0 .75em; } small, .muted { color: var(--muted); }
label { display: block; font-weight: 500; margin: .5em 0 .25em; }
input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea {
  width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: inherit; font: inherit; }
input:focus, select:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 30%, transparent); border-color: var(--accent); }
input[type=range], input[type=checkbox], input[type=radio] { accent-color: var(--accent); }
input[type=range] { width: 100%; }
button { font: inherit; font-weight: 500; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: inherit; cursor: pointer; }
button:hover { background: var(--soft); }
button.primary, button[type=submit] { background: var(--accent); border-color: var(--accent); color: #fff; }
button:disabled { opacity: .5; cursor: default; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
.selected, [aria-pressed=true] { outline: 2px solid var(--accent); }`;

	// Runs inside the iframe before petite-vue: the $submit bridge, height reporting, error relay.
	const bridge = (initialJson: string) => `
window.$initial = JSON.parse(${initialJson});
const send = (msg) => parent.postMessage({ workbench: true, ...msg }, '*');
window.$submit = (data) => {
  try { send({ type: 'submit', data: JSON.parse(JSON.stringify(data ?? null)) }); }
  catch (e) { send({ type: 'error', message: 'Could not send: ' + e.message }); }
};
new ResizeObserver(() => send({ type: 'height', height: document.documentElement.scrollHeight })).observe(document.body);
window.addEventListener('error', (e) => send({ type: 'error', message: e.message }));`;

	// JSON inside a <script>: escape '<' so the data can't close the tag.
	const scriptJson = (value: unknown) =>
		JSON.stringify(JSON.stringify(value ?? null)).replace(/</g, '\\u003c');

	const srcdoc = $derived(`<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<style>${BASE_CSS}</style></head><body>
<div id="wb-root" v-scope>${spec.html}</div>
<script>${bridge(scriptJson(initial))}<\/script>
<script>${runtime}<\/script>
<script>PetiteVue.createApp({ $submit: window.$submit, $initial: window.$initial }).mount('#wb-root');<\/script>
</body></html>`);

	$effect(() => {
		const onMessage = (e: MessageEvent) => {
			// Only trust messages from this widget's own frame.
			if (!frame || e.source !== frame.contentWindow || !e.data?.workbench) return;
			const msg = e.data as { type: string; height?: number; data?: unknown; message?: string };
			if (msg.type === 'height' && typeof msg.height === 'number') {
				height = Math.min(Math.max(msg.height + 4, 60), 900);
			} else if (msg.type === 'error') {
				error = String(msg.message ?? 'Widget error');
			} else if (msg.type === 'submit' && live) {
				if (!msg.data || typeof msg.data !== 'object' || Array.isArray(msg.data)) {
					error = 'The widget sent something other than an object.';
					return;
				}
				error = '';
				onsubmit(msg.data as Record<string, unknown>);
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});
</script>

<div data-testid="widget" class="space-y-2">
	{#if spec.description}<p
			data-testid="widget-description"
			class="text-sm text-zinc-600 dark:text-zinc-400"
		>
			{spec.description}
		</p>{/if}
	<iframe
		bind:this={frame}
		data-testid="widget-frame"
		{title}
		sandbox="allow-scripts"
		{srcdoc}
		inert={!live}
		class="w-full border-0 bg-transparent {live ? '' : 'opacity-80'}"
		style="height: {height}px"
	></iframe>
	{#if error}<p data-testid="widget-error" class="text-xs text-rose-600">{error}</p>{/if}
</div>
