<script lang="ts">
	import { CAMERA_PRESETS } from '#lib/room-showcase/presets.ts';
	import type { RoomHandle, RoomStyle } from '#lib/room-showcase/scene.ts';

	/**
	 * James's photoreal showcase room as an embeddable view. It loads ~24 MB of models and
	 * textures, so it only starts once scrolled into view, and is disposed when unmounted.
	 */
	let { class: className = '', style = 'airy' }: { class?: string; style?: RoomStyle } = $props();

	let container: HTMLDivElement;
	let host: HTMLDivElement;
	let preset = $state(CAMERA_PRESETS[0].id);
	let status = $state<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle');
	let progress = $state(0);
	let handle: RoomHandle | null = null;

	$effect(() => {
		let cancelled = false;
		const start = async () => {
			if (!document.createElement('canvas').getContext('webgl2')) {
				status = 'unsupported';
				return;
			}
			status = 'loading';
			const { createRoom } = await import('#lib/room-showcase/scene.ts');
			if (cancelled) return;
			const h = await createRoom(container, {
				style,
				onProgress: (n, total) => (progress = Math.round((n / total) * 100)),
				onReady: () => (status = 'ready'),
				onError: () => (status = 'error')
			});
			if (cancelled) h.dispose();
			else {
				handle = h;
				h.setPreset(preset);
			}
		};
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				io.disconnect();
				start().catch(() => (status = 'error'));
			}
		});
		io.observe(host);
		return () => {
			cancelled = true;
			io.disconnect();
			handle?.dispose();
			handle = null;
		};
	});

	function choose(id: string) {
		preset = id;
		handle?.setPreset(id);
	}
</script>

<div
	data-testid="room-scene"
	class="relative overflow-hidden bg-stone-900 {className}"
	bind:this={host}
>
	<div class="absolute inset-0" bind:this={container}></div>
	{#if status !== 'ready'}
		<div class="absolute inset-0 grid place-items-center text-xs text-stone-300">
			{#if status === 'unsupported'}3D needs WebGL2{:else if status === 'error'}Couldn't load the
				room{:else}Staging the room… {progress}%{/if}
		</div>
	{/if}
	<div data-testid="room-scene-presets" class="absolute bottom-2 left-2 flex gap-1">
		{#each CAMERA_PRESETS as p (p.id)}
			<button
				data-testid="room-scene-preset"
				class="rounded-md px-2 py-0.5 text-[11px] font-medium backdrop-blur {p.id === preset
					? 'bg-white/90 text-stone-900'
					: 'bg-black/40 text-white hover:bg-black/60'}"
				aria-pressed={p.id === preset}
				onclick={() => choose(p.id)}>{p.label}</button
			>
		{/each}
	</div>
</div>
