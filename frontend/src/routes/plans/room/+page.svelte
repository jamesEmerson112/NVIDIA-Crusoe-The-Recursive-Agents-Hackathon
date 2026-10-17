<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { CAMERA_PRESETS } from '#lib/room-showcase/presets.ts';
	import type { RoomHandle } from '#lib/room-showcase/scene.ts';

	let container: HTMLDivElement;
	let handle: RoomHandle | null = null;
	let preset = $state(CAMERA_PRESETS[0].id);
	let status = $state<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
	let progress = $state(0);
	let error = $state('');
	/** Opened from a blueprint: `?c=<conversation>&a=<artifact>` links back to it. */
	const fromHref = $derived.by(() => {
		const c = page.url.searchParams.get('c')?.match(/^[\w-]+$/)?.[0];
		const a = page.url.searchParams.get('a')?.match(/^[\w-]+$/)?.[0];
		return c ? `/c/${c}${a ? `?a=${a}` : ''}` : null;
	});

	onMount(() => {
		let cancelled = false;
		// `?view=window` opens a specific camera preset (handy for screenshots).
		const initial = CAMERA_PRESETS.find((p) => p.id === page.url.searchParams.get('view'));
		if (initial) preset = initial.id;
		(async () => {
			const probe = document.createElement('canvas');
			if (!probe.getContext('webgl2')) {
				status = 'unsupported';
				return;
			}
			const { createRoom } = await import('#lib/room-showcase/scene.ts');
			if (cancelled) return;
			const h = await createRoom(container, {
				onProgress: (n, total) => (progress = Math.round((n / total) * 100)),
				onReady: () => (status = 'ready'),
				onError: (m) => {
					error = m;
					status = 'error';
				}
			});
			if (cancelled) h.dispose();
			else {
				handle = h;
				h.setPreset(preset);
			}
		})().catch((e: unknown) => {
			error = e instanceof Error ? e.message : String(e);
			status = 'error';
		});
		return () => {
			cancelled = true;
			handle?.dispose();
			handle = null;
		};
	});

	function choose(id: string) {
		preset = id;
		handle?.setPreset(id);
	}
</script>

<svelte:head><title>Showcase room</title></svelte:head>

<div data-testid="room-root" class="relative flex min-w-0 flex-1 flex-col bg-stone-900">
	<header
		class="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950"
	>
		<a data-testid="room-back" href="/plans" class="text-sm text-zinc-500 hover:underline"
			>&larr; Blueprints</a
		>
		{#if fromHref}
			<a data-testid="room-from" href={fromHref} class="text-sm text-zinc-500 hover:underline"
				>From conversation</a
			>
		{/if}
		<h1 data-testid="room-heading" class="text-sm font-semibold">Showcase room</h1>
		<div data-testid="room-presets" class="flex gap-1" role="group" aria-label="Camera">
			{#each CAMERA_PRESETS as p (p.id)}
				<button
					data-testid="room-preset-{p.id}"
					class="rounded-lg px-3 py-1 text-sm {p.id === preset
						? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
						: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
					aria-pressed={p.id === preset}
					onclick={() => choose(p.id)}>{p.label}</button
				>
			{/each}
		</div>
		<span data-testid="room-status" class="ml-auto text-xs text-zinc-500">
			{#if status === 'loading'}Loading {progress}%{:else if status === 'ready'}Drag to orbit,
				scroll to zoom{:else if status === 'unsupported'}WebGL2 is not available{:else}Error: {error}{/if}
		</span>
	</header>
	<div data-testid="room-canvas" class="relative min-h-0 flex-1" bind:this={container}></div>
</div>
