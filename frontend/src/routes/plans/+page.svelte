<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PlanViewer from '#lib/components/PlanViewer.svelte';
	import type { Plan } from '#lib/floorplan/types.ts';
	import { floorArea, validatePlan } from '#lib/floorplan/validate.ts';
	import type { ExternalTimings, View } from '#lib/floorplan/three/viewer.ts';
	import { parseQuality, type Quality } from '#lib/floorplan/three/quality.ts';

	const PLANS = [
		{ id: 'sf-studio', label: 'Studio' },
		{ id: 'sf-1br', label: '1 bedroom' },
		{ id: 'sf-2br', label: '2 bedroom' },
		{ id: 'sample-1br', label: 'Sample 1BR' }
	];
	// Laurie's formloop demo serves every listing as a Plan (GET /api/plan/<id>, CORS enabled).
	const FORMLOOP_URL = 'http://localhost:5190';
	const VIEWS: { id: View; label: string }[] = [
		{ id: 'dollhouse', label: 'Dollhouse' },
		{ id: 'top', label: 'Top-down' },
		{ id: 'full', label: 'Full height' },
		{ id: 'walk', label: 'Walk' }
	];

	const planId = $derived(
		PLANS.find((p) => p.id === page.url.searchParams.get('plan'))?.id ?? PLANS[0].id
	);
	/** `?listing=syn_000` loads a formloop listing instead of a bundled plan. */
	const listing = $derived(page.url.searchParams.get('listing')?.match(/^[\w-]+$/)?.[0] ?? null);
	const debug = $derived(page.url.searchParams.get('debug') === '1');
	const forced = $derived(parseQuality(page.url.searchParams.get('quality')));
	let active = $state<{ quality: Quality; reason: string } | null>(null);
	/** `?view=walk` (or top, full) opens the viewer in that camera mode. */
	const view = $derived(
		VIEWS.find((v) => v.id === page.url.searchParams.get('view'))?.id ?? 'dollhouse'
	);
	let plan = $state.raw<Plan | null>(null);
	let timings = $state.raw<ExternalTimings>({});
	let problems = $state<string[]>([]);

	function setParam(key: string, value: string | null) {
		const params = new URLSearchParams(page.url.search);
		if (value === null) params.delete(key);
		else params.set(key, value);
		goto(`?${params}`, { replace: true });
	}

	$effect(() => {
		const url = listing ? `${FORMLOOP_URL}/api/plan/${listing}` : `/plans/${planId}.json`;
		let stale = false;
		const t0 = performance.now();
		fetch(url)
			.then((r) => {
				if (!r.ok) throw new Error(`${r.status} loading ${url}`);
				return r.json() as Promise<Plan>;
			})
			.then((next) => {
				if (stale) return;
				const t1 = performance.now();
				problems = validatePlan(next);
				timings = { fetchMs: t1 - t0, validateMs: performance.now() - t1 };
				plan = next;
			})
			.catch((err: Error) => {
				if (!stale) problems = [`Couldn't load the blueprint: ${err.message}`];
			});
		return () => (stale = true);
	});

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, [contenteditable]')) return;
		// In walk mode D strafes right, so the debug shortcut is off there.
		// Esc first releases the pointer lock (the browser handles that); a second Esc leaves walk mode.
		if (view === 'walk' && e.key === 'Escape' && !document.pointerLockElement)
			setParam('view', null);
		if (view !== 'walk' && (e.key === 'd' || e.key === 'D')) setParam('debug', debug ? null : '1');
	}
</script>

<svelte:window {onkeydown} />

<div data-testid="plans-root" class="flex min-w-0 flex-1 flex-col">
	<header
		class="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800"
	>
		<h1 data-testid="plans-heading" class="text-sm font-semibold">Blueprints</h1>
		<div data-testid="plans-select" class="flex gap-1" role="group" aria-label="Blueprint">
			{#each PLANS as p (p.id)}
				<button
					data-testid="plans-option"
					class="rounded-lg px-3 py-1 text-sm {!listing && p.id === planId
						? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
						: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
					aria-pressed={!listing && p.id === planId}
					onclick={() => {
						const params = new URLSearchParams(page.url.search);
						params.delete('listing');
						params.set('plan', p.id);
						goto(`?${params}`, { replace: true });
					}}>{p.label}</button
				>
			{/each}
		</div>
		<div data-testid="plans-views" class="flex gap-1" role="group" aria-label="View">
			{#each VIEWS as v (v.id)}
				<button
					data-testid="plans-view-{v.id}"
					class="rounded-lg px-3 py-1 text-sm {v.id === view
						? 'bg-emerald-600 text-white'
						: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
					aria-pressed={v.id === view}
					onclick={() => setParam('view', v.id === 'dollhouse' ? null : v.id)}>{v.label}</button
				>
			{/each}
		</div>
		{#if plan}
			<span data-testid="plans-summary" class="text-xs text-zinc-500"
				>{plan.name} · {floorArea(plan).toFixed(1)} m² · synthetic layout</span
			>
		{/if}
		<div
			data-testid="plans-quality"
			class="ml-auto flex items-center gap-1 text-sm"
			role="group"
			aria-label="Render quality"
			title={active?.reason ?? ''}
		>
			<span class="text-xs text-zinc-500"
				>Quality{active ? `: ${forced ? '' : 'auto · '}${active.quality}` : ''}</span
			>
			{#each [null, 'low', 'high'] as const as q (q ?? 'auto')}
				<button
					data-testid="plans-quality-{q ?? 'auto'}"
					class="rounded-lg px-2 py-1 {forced === q
						? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
						: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
					aria-pressed={forced === q}
					onclick={() => setParam('quality', q)}>{q ?? 'Auto'}</button
				>
			{/each}
		</div>
		<button
			data-testid="plans-debug-toggle"
			class="rounded-lg border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700 {debug
				? 'bg-amber-500/15'
				: ''}"
			aria-pressed={debug}
			title="Toggle debug mode (D)"
			onclick={() => setParam('debug', debug ? null : '1')}>Debug {debug ? 'on' : 'off'}</button
		>
	</header>
	{#if problems.length}
		<ul
			data-testid="plans-problems"
			class="bg-rose-500/10 px-4 py-2 text-xs text-rose-700 dark:text-rose-300"
		>
			{#each problems as problem (problem)}<li>{problem}</li>{/each}
		</ul>
	{/if}
	<div class="relative min-h-0 flex-1">
		{#key forced}
			<PlanViewer
				{plan}
				{view}
				{debug}
				{timings}
				quality={forced}
				onquality={(info) => (active = info)}
			/>
		{/key}
		{#if view === 'walk'}
			<p
				data-testid="plans-walk-hint"
				class="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-zinc-900/75 px-3 py-1.5 text-xs text-white"
			>
				Click to look · WASD to move · Shift to run · Esc to exit
			</p>
		{/if}
	</div>
</div>
