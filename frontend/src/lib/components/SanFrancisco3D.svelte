<script lang="ts">
	// Ambient 3D San Francisco skyline behind the start page (decorative, non-interactive).
	// three.js loads through a dynamic import in onMount, so it never runs during SSR and stays
	// out of the initial bundle. Without WebGL2 the backdrop simply stays empty.
	import { onMount } from 'svelte';
	import type { SfScene } from '#lib/sf3d/scene.ts';

	let host: HTMLDivElement;
	let ready = $state(false);

	function hasWebGL2() {
		try {
			return !!document.createElement('canvas').getContext('webgl2');
		} catch {
			return false;
		}
	}

	onMount(() => {
		if (!hasWebGL2()) return;
		let scene: SfScene | undefined;
		let cancelled = false;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			scene?.resize(width, height);
		});

		import('#lib/sf3d/scene.ts')
			.then(({ createSanFrancisco3D }) =>
				createSanFrancisco3D(host, {
					dataUrl: '/sf3d/sf-iconic-buildings.json',
					reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
				})
			)
			.then((created) => {
				if (cancelled) return created.dispose();
				scene = created;
				scene.resize(host.clientWidth, host.clientHeight);
				observer.observe(host);
				ready = true;
			})
			.catch((err) => console.warn('SF 3D backdrop unavailable:', err));

		return () => {
			cancelled = true;
			observer.disconnect();
			scene?.dispose();
		};
	});
</script>

<div
	data-testid="sf3d-backdrop"
	aria-hidden="true"
	class="pointer-events-none absolute inset-0 overflow-hidden {ready
		? 'opacity-50 dark:opacity-40'
		: 'opacity-0'}"
	style="mask-image: radial-gradient(ellipse 70% 65% at 50% 55%, black 30%, transparent 100%);"
>
	<div bind:this={host} data-testid="sf3d-host" class="h-full w-full"></div>
</div>
