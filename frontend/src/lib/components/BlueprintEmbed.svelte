<script lang="ts">
	import { planLabel } from '#lib/floorplan/catalog.ts';
	import type { BlueprintSpec } from '#lib/types.ts';
	import PlanSketch from './PlanSketch.svelte';
	import RoomScene from './RoomScene.svelte';
	import StatusBadge from './StatusBadge.svelte';

	/** A blueprint artifact embedded in the chat: staged living room + floor plan of one place. */
	let {
		id,
		cid,
		title,
		status,
		spec
	}: {
		id: string;
		cid: string;
		title: string;
		status: string;
		spec: BlueprintSpec;
	} = $props();

	let tab = $state<'room' | 'plan'>('room');
	const viewerHref = $derived(`/plans/view?plan=${encodeURIComponent(spec.plan)}&c=${cid}&a=${id}`);
	const roomHref = $derived(`/plans/room?c=${cid}&a=${id}`);
	const tabClass = (on: boolean) =>
		`rounded-md px-2 py-0.5 text-xs font-medium ${on ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`;
</script>

<div
	data-testid="blueprint-embed"
	class="max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
>
	<div class="flex items-start gap-2 px-5 pt-4 pb-3">
		<div class="min-w-0 flex-1">
			<h3 data-testid="blueprint-embed-title" class="font-semibold">{title}</h3>
			<p class="text-xs text-zinc-500">
				{#if spec.address}{spec.address} ·
				{/if}{planLabel(spec.plan)} · staged 3D walkthrough
			</p>
		</div>
		{#if status === 'stale'}<StatusBadge status="stale" />{/if}
		<div
			data-testid="blueprint-embed-tabs"
			class="flex shrink-0 gap-1"
			role="group"
			aria-label="View"
		>
			<button
				data-testid="blueprint-embed-tab-room"
				class={tabClass(tab === 'room')}
				aria-pressed={tab === 'room'}
				onclick={() => (tab = 'room')}>Living room</button
			>
			<button
				data-testid="blueprint-embed-tab-plan"
				class={tabClass(tab === 'plan')}
				aria-pressed={tab === 'plan'}
				onclick={() => (tab = 'plan')}>Floor plan</button
			>
		</div>
	</div>

	{#if tab === 'room'}
		<RoomScene class="h-80" />
	{:else}
		<a
			data-testid="blueprint-embed-plan"
			href={viewerHref}
			class="group relative block bg-zinc-50 dark:bg-zinc-950"
		>
			<PlanSketch plan={spec.plan} class="h-80 p-4" />
			<span
				class="absolute right-3 bottom-3 rounded-md bg-white/90 px-2 py-1 text-xs font-medium shadow-sm group-hover:bg-white dark:bg-zinc-900/90"
				>Open in 3D →</span
			>
		</a>
	{/if}

	{#if spec.summary || spec.highlights?.length}
		<div class="space-y-2 px-5 pt-3">
			{#if spec.summary}<p
					data-testid="blueprint-embed-summary"
					class="text-sm text-zinc-700 dark:text-zinc-300"
				>
					{spec.summary}
				</p>{/if}
			{#if spec.highlights?.length}
				<ul data-testid="blueprint-embed-highlights" class="flex flex-wrap gap-1.5">
					{#each spec.highlights as h (h)}
						<li
							class="rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-300"
						>
							{h}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
	<div class="flex gap-3 px-5 pt-2 pb-4 text-xs">
		<a
			data-testid="blueprint-embed-fullscreen"
			href={tab === 'room' ? roomHref : viewerHref}
			class="text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
			>Full screen</a
		>
		<a
			href="/plans"
			class="text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
			>Open in Blueprints</a
		>
	</div>
</div>
