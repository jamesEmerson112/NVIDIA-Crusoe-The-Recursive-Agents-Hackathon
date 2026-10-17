<script lang="ts">
	import type { Plan, RoomType } from '#lib/floorplan/types.ts';

	/** Top-down sketch of a bundled blueprint's ground floor, for cards. No WebGL. */
	let { plan: planId, class: className = '' }: { plan: string; class?: string } = $props();

	let plan = $state.raw<Plan | null>(null);
	let failed = $state(false);

	$effect(() => {
		let stale = false;
		failed = false;
		fetch(`/plans/${planId}.json`)
			.then((r) =>
				r.ok ? (r.json() as Promise<Plan>) : Promise.reject(new Error(String(r.status)))
			)
			.then((p) => !stale && (plan = p))
			.catch(() => !stale && (failed = true));
		return () => (stale = true);
	});

	const story = $derived(plan?.stories[0]);
	// Plan y points north; SVG y points down, so flip it.
	const bounds = $derived.by(() => {
		const pts = [
			...(story?.rooms.flatMap((r) => r.polygon) ?? []),
			...(story?.walls.flatMap((w) => [w.a, w.b]) ?? [])
		];
		if (!pts.length) return null;
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		return {
			minX: Math.min(...xs),
			maxX: Math.max(...xs),
			minY: Math.min(...ys),
			maxY: Math.max(...ys)
		};
	});
	const pad = 0.4;
	const viewBox = $derived(
		bounds
			? `${bounds.minX - pad} ${-bounds.maxY - pad} ${bounds.maxX - bounds.minX + 2 * pad} ${bounds.maxY - bounds.minY + 2 * pad}`
			: '0 0 1 1'
	);
	const points = (poly: [number, number][]) => poly.map(([x, y]) => `${x},${-y}`).join(' ');
	const FILL: Record<RoomType, string> = {
		living: '#d9f99d',
		bedroom: '#bfdbfe',
		kitchen: '#fde68a',
		bath: '#a5f3fc',
		hall: '#e4e4e7',
		utility: '#e7e5e4'
	};
</script>

<div data-testid="plan-sketch" class="grid place-items-center {className}">
	{#if story && bounds}
		<svg {viewBox} class="h-full w-full" role="img" aria-label="Floor plan of {plan?.name}">
			{#each story.rooms as r (r.id)}
				<polygon points={points(r.polygon)} fill={FILL[r.type] ?? '#e4e4e7'} opacity="0.85" />
			{/each}
			{#each story.walls as w (w.id)}
				<line
					x1={w.a[0]}
					y1={-w.a[1]}
					x2={w.b[0]}
					y2={-w.b[1]}
					stroke="#27272a"
					stroke-width={Math.max(w.t, 0.12)}
					stroke-linecap="square"
				/>
			{/each}
		</svg>
	{:else if failed}
		<span class="text-xs text-zinc-400">No preview</span>
	{:else}
		<span class="size-2 animate-pulse rounded-full bg-zinc-300"></span>
	{/if}
</div>
