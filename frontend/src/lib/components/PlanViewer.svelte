<script lang="ts">
	import { onMount } from 'svelte';
	import type { Plan } from '#lib/floorplan/types.ts';
	import type { ExternalTimings, View, Viewer } from '#lib/floorplan/three/viewer.ts';

	let {
		plan,
		view = 'dollhouse',
		debug = false,
		timings = {}
	}: { plan: Plan | null; view?: View; debug?: boolean; timings?: ExternalTimings } = $props();

	let host: HTMLDivElement;
	let viewer = $state.raw<Viewer | null>(null);
	let error = $state('');

	onMount(() => {
		let disposed = false;
		// three loads here, in the browser only, as its own lazy chunk.
		import('#lib/floorplan/three/viewer.ts')
			.then(({ mount }) => mount(host, { debug }))
			.then((v) => {
				if (disposed) v.dispose();
				else viewer = v;
			})
			.catch((err: Error) => (error = `3D rendering failed: ${err.message}`));
		return () => {
			disposed = true;
			viewer?.dispose();
			viewer = null;
		};
	});

	$effect(() => {
		if (viewer && plan) viewer.setPlan(plan, timings);
	});
	$effect(() => {
		viewer?.setView(view);
	});
	$effect(() => {
		viewer?.setDebug(debug);
	});
</script>

<div data-testid="plan-viewer" class="relative h-full w-full overflow-hidden" bind:this={host}>
	{#if error}
		<p
			data-testid="plan-viewer-error"
			class="absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
		>
			{error}
		</p>
	{:else if !viewer}
		<p
			data-testid="plan-viewer-loading"
			class="absolute inset-0 grid place-items-center text-sm text-zinc-500"
		>
			Starting the renderer…
		</p>
	{/if}
</div>

<style>
	:global(.plan-label) {
		padding: 2px 6px;
		border-radius: 6px;
		background: rgb(255 255 255 / 0.85);
		color: #18181b;
		font:
			11px/1.3 ui-sans-serif,
			system-ui,
			sans-serif;
		text-align: center;
		white-space: nowrap;
	}
	:global(.plan-label-wall) {
		background: rgb(239 68 68 / 0.85);
		color: white;
		font-family: ui-monospace, monospace;
	}
</style>
