<script lang="ts">
	// Ambient 3D San Francisco behind the start page (decorative, non-interactive).
	// With PUBLIC_MAPTILER_KEY it shows the real city (MapLibre + MapTiler tiles, `sf3d/map.ts`);
	// without a key, or if the map fails, it falls back to the keyless three.js skyline
	// (`sf3d/scene.ts`). Both load through a dynamic import in onMount, so they never run during
	// SSR and stay out of the initial bundle. Without WebGL2 the backdrop simply stays empty.
	import { onMount } from 'svelte';
	import { PUBLIC_MAPTILER_KEY } from '$app/env/public';
	import type { SfScene } from '#lib/sf3d/scene.ts';

	let host: HTMLDivElement;
	let mode = $state<'map' | 'skyline' | null>(null);

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
		const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			scene?.resize(width, height);
		});

		const skyline = () =>
			import('#lib/sf3d/scene.ts').then(({ createSanFrancisco3D }) =>
				createSanFrancisco3D(host, { dataUrl: '/sf3d/sf-iconic-buildings.json', reducedMotion })
			);
		const realMap = (apiKey: string) =>
			import('#lib/sf3d/map.ts').then(({ createSanFranciscoMap }) =>
				createSanFranciscoMap(host, { apiKey, reducedMotion })
			);

		const start = async () => {
			if (PUBLIC_MAPTILER_KEY) {
				try {
					return { created: await realMap(PUBLIC_MAPTILER_KEY), kind: 'map' as const };
				} catch (err) {
					console.warn('SF map unavailable, using the offline skyline:', err);
					host.replaceChildren();
				}
			}
			return { created: await skyline(), kind: 'skyline' as const };
		};

		start()
			.then(({ created, kind }) => {
				if (cancelled) return created.dispose();
				scene = created;
				scene.resize(host.clientWidth, host.clientHeight);
				observer.observe(host);
				mode = kind;
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
	data-sf3d-mode={mode ?? 'loading'}
	aria-hidden="true"
	class="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-1000 {mode ===
	'map'
		? 'opacity-80 dark:opacity-40 dark:hue-rotate-180 dark:invert'
		: mode === 'skyline'
			? 'opacity-50 dark:opacity-40'
			: 'opacity-0'}"
	style="mask-image: radial-gradient(ellipse 75% 70% at 50% 55%, black 35%, transparent 100%);"
>
	<div bind:this={host} data-testid="sf3d-host" class="h-full w-full"></div>
</div>
{#if mode === 'map'}
	<p
		data-testid="sf3d-attribution"
		class="pointer-events-none absolute right-3 bottom-2 text-[10px] text-zinc-400 dark:text-zinc-600"
	>
		© MapTiler © OpenStreetMap contributors
	</p>
{/if}
