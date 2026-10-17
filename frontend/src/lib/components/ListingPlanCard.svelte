<script lang="ts">
	import PlanViewer from '#lib/components/PlanViewer.svelte';
	import type { Plan } from '#lib/floorplan/types.ts';
	import type { Quality } from '#lib/floorplan/three/quality.ts';

	// A listing's live 3D blueprint, sized to sit inside an artifact panel or chat card, with links
	// to the full viewer, the first-person walk and the path-traced photo mode.
	let {
		listingId,
		plan = null,
		height = 320,
		quality = 'low'
	}: {
		/** A formloop listing id such as `syn_000` (see #lib/server/listings.ts). */
		listingId: string;
		/** Pass the plan if you already have it; otherwise it's fetched from /api/plan/<listingId>. */
		plan?: Plan | null;
		height?: number;
		/** Low by default: each card is its own renderer, and High loads every furniture model. */
		quality?: Quality;
	} = $props();

	let fetched = $state.raw<Plan | null>(null);
	let error = $state('');
	const shown = $derived(plan ?? fetched);
	const id = $derived(encodeURIComponent(listingId));

	$effect(() => {
		if (plan) return;
		let stale = false;
		error = '';
		fetch(`/api/plan/${id}`)
			.then((r) => {
				if (!r.ok) throw new Error(`${r.status}`);
				return r.json() as Promise<Plan>;
			})
			.then((next) => {
				if (!stale) fetched = next;
			})
			.catch((err: Error) => {
				if (!stale) error = `Couldn't load the blueprint (${err.message})`;
			});
		return () => (stale = true);
	});

	const link =
		'rounded-lg border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800';
</script>

<div
	data-testid="listing-plan-card"
	class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
>
	<div data-testid="listing-plan-viewer" style:height="{height}px">
		{#if error}
			<p data-testid="listing-plan-error" class="p-4 text-sm text-rose-600">{error}</p>
		{:else}
			<PlanViewer plan={shown} {quality} />
		{/if}
	</div>
	<div
		class="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800"
	>
		<span data-testid="listing-plan-name" class="mr-auto truncate text-xs text-zinc-500"
			>{shown?.name ?? listingId}</span
		>
		<a data-testid="listing-plan-open" class={link} href="/plans/view?listing={id}">Open 3D</a>
		<a data-testid="listing-plan-walk" class={link} href="/plans/view?listing={id}&view=walk"
			>Walk</a
		>
		<a data-testid="listing-plan-photo" class={link} href="/plans/photo?listing={id}">Photo</a>
	</div>
</div>
