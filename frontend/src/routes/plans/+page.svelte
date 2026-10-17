<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PlanViewer from '#lib/components/PlanViewer.svelte';
	import type { Plan } from '#lib/floorplan/types.ts';
	import { floorArea, validatePlan } from '#lib/floorplan/validate.ts';
	import type { ExternalTimings, View } from '#lib/floorplan/three/viewer.ts';

	const PLANS = [
		{ id: 'sf-studio', label: 'Studio' },
		{ id: 'sf-1br', label: '1 bedroom' },
		{ id: 'sf-2br', label: '2 bedroom' },
		{ id: 'sample-1br', label: 'Sample 1BR' }
	];
	const VIEWS: { id: View; label: string }[] = [
		{ id: 'dollhouse', label: 'Dollhouse' },
		{ id: 'top', label: 'Top-down' },
		{ id: 'full', label: 'Full height' }
	];

	const planId = $derived(
		PLANS.find((p) => p.id === page.url.searchParams.get('plan'))?.id ?? PLANS[0].id
	);
	const debug = $derived(page.url.searchParams.get('debug') === '1');
	let view = $state<View>('dollhouse');
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
		const id = planId;
		let stale = false;
		const t0 = performance.now();
		fetch(`/plans/${id}.json`)
			.then((r) => r.json() as Promise<Plan>)
			.then((next) => {
				if (stale) return;
				const t1 = performance.now();
				problems = validatePlan(next);
				timings = { fetchMs: t1 - t0, validateMs: performance.now() - t1 };
				plan = next;
			});
		return () => (stale = true);
	});

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, [contenteditable]')) return;
		if (e.key === 'd' || e.key === 'D') setParam('debug', debug ? null : '1');
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
					class="rounded-lg px-3 py-1 text-sm {p.id === planId
						? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
						: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
					aria-pressed={p.id === planId}
					onclick={() => setParam('plan', p.id)}>{p.label}</button
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
					onclick={() => (view = v.id)}>{v.label}</button
				>
			{/each}
		</div>
		{#if plan}
			<span data-testid="plans-summary" class="text-xs text-zinc-500"
				>{plan.name} · {floorArea(plan).toFixed(1)} m² · synthetic layout</span
			>
		{/if}
		<button
			data-testid="plans-debug-toggle"
			class="ml-auto rounded-lg border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700 {debug
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
	<div class="min-h-0 flex-1">
		<PlanViewer {plan} {view} {debug} {timings} />
	</div>
</div>
