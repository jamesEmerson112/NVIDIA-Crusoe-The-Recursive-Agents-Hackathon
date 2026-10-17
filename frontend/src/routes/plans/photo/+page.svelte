<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Plan } from '#lib/floorplan/types.ts';
	import type { PhotoCamera, PhotoMode, PhotoStatus } from '#lib/floorplan/three/photo.ts';

	// Same ids and formloop source as /plans.
	const PLAN_IDS = ['sf-studio', 'sf-1br', 'sf-2br', 'sample-1br'];

	const params = page.url.searchParams;
	const planId = PLAN_IDS.find((p) => p === params.get('plan')) ?? 'sf-2br';
	const listing = params.get('listing')?.match(/^[\w-]+$/)?.[0] ?? null;

	let camera = $state<PhotoCamera>(params.get('cam') === 'interior' ? 'interior' : 'orbit');
	let fullRes = $state(params.get('res') === 'full');
	let status = $state<PhotoStatus | null>(null);
	let name = $state('');
	let error = $state('');
	let host: HTMLDivElement;
	let photo = $state.raw<PhotoMode | null>(null);

	const backHref = $derived(
		listing ? `/plans/view?listing=${listing}` : `/plans/view?plan=${planId}`
	);

	function setParam(key: string, value: string | null) {
		const next = new URLSearchParams(page.url.search);
		if (value === null) next.delete(key);
		else next.set(key, value);
		goto(`?${next}`, { replace: true });
	}

	onMount(() => {
		let disposed = false;
		const url = listing ? `/api/plan/${listing}` : `/plans/${planId}.json`;
		Promise.all([
			fetch(url).then((r) => {
				if (!r.ok) throw new Error(`${r.status} loading ${url}`);
				return r.json() as Promise<Plan>;
			}),
			// three and the path tracer load here, in the browser only, as their own lazy chunk.
			import('#lib/floorplan/three/photo.ts')
		])
			.then(([plan, { mountPhoto }]) => {
				name = plan.name;
				return mountPhoto(host, plan, {
					camera,
					fullRes,
					onstatus: (s) => (status = s)
				});
			})
			.then((p) => {
				if (disposed) p.dispose();
				else photo = p;
			})
			.catch((err: Error) => (error = `Photo mode failed: ${err.message}`));
		return () => {
			disposed = true;
			photo?.dispose();
			photo = null;
		};
	});

	$effect(() => {
		photo?.setCamera(camera);
	});
	$effect(() => {
		photo?.setFullRes(fullRes);
	});
</script>

<div data-testid="plans-photo-root" class="flex min-w-0 flex-1 flex-col">
	<header
		class="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800"
	>
		<a
			data-testid="plans-photo-back"
			href={backHref}
			class="rounded-lg px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">← Blueprints</a
		>
		<h1 data-testid="plans-photo-heading" class="text-sm font-semibold">Photo mode</h1>
		{#if name}<span data-testid="plans-photo-name" class="text-xs text-zinc-500">{name}</span>{/if}
		<div class="ml-auto flex gap-1" role="group" aria-label="Camera">
			{#each [{ id: 'orbit', label: 'Orbit' }, { id: 'interior', label: 'Eye level (living room)' }] as const as c (c.id)}
				<button
					data-testid="plans-photo-cam-{c.id}"
					class="rounded-lg px-3 py-1 text-sm {camera === c.id
						? 'bg-emerald-600 text-white'
						: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
					aria-pressed={camera === c.id}
					onclick={() => {
						camera = c.id;
						setParam('cam', c.id === 'interior' ? 'interior' : null);
					}}>{c.label}</button
				>
			{/each}
		</div>
		<button
			data-testid="plans-photo-fullres"
			class="rounded-lg border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700 {fullRes
				? 'bg-amber-500/15'
				: ''}"
			aria-pressed={fullRes}
			title="Render at the display's full pixel ratio (slower to converge)"
			onclick={() => {
				fullRes = !fullRes;
				setParam('res', fullRes ? 'full' : null);
			}}>Full res {fullRes ? 'on' : 'off'}</button
		>
	</header>
	<div class="relative min-h-0 flex-1">
		<div data-testid="plans-photo-viewport" class="h-full w-full" bind:this={host}></div>
		{#if error}
			<p
				data-testid="plans-photo-error"
				class="absolute inset-x-4 top-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
			>
				{error}
			</p>
		{:else}
			<div
				data-testid="plans-photo-hud"
				class="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1.5 font-mono text-xs text-white"
			>
				{#if !status || status.phase === 'building'}
					Building scene…
				{:else}
					<span data-testid="plans-photo-samples">{status.samples} / {status.target} samples</span>
					·
					<span data-testid="plans-photo-state"
						>{status.phase === 'done' ? 'Done' : 'Refining…'}</span
					>
				{/if}
			</div>
		{/if}
	</div>
</div>
