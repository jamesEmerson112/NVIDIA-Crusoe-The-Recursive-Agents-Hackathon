<script lang="ts">
	import PlanSketch from '#lib/components/PlanSketch.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { planLabel } from '#lib/floorplan/catalog.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const viewerHref = (b: (typeof data.blueprints)[number]) =>
		`/plans/view?plan=${encodeURIComponent(b.spec.plan)}&c=${b.conversationId}&a=${b.id}`;
</script>

<svelte:head><title>Blueprints · Workbench</title></svelte:head>

<div data-testid="blueprints-root" class="min-w-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-5xl px-5 py-8">
		<h1 data-testid="blueprints-heading" class="text-2xl font-semibold tracking-tight">
			Blueprints
		</h1>
		<p class="mt-1 text-sm text-zinc-500">
			Staged 3D walkthroughs the agent made in your conversations. Open one to look around.
		</p>

		{#if data.blueprints.length}
			<ul data-testid="blueprints-grid" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.blueprints as b (b.id)}
					<li
						data-testid="blueprint-card"
						class="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
					>
						<a
							data-testid="blueprint-open"
							href="/plans/room?c={b.conversationId}&a={b.id}"
							class="block hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
						>
							<PlanSketch plan={b.spec.plan} class="h-44 bg-zinc-50 p-3 dark:bg-zinc-950" />
							<div class="space-y-1 px-4 pt-3">
								<div class="flex items-center gap-2">
									<h2 data-testid="blueprint-title" class="min-w-0 flex-1 truncate font-medium">
										{b.title}
									</h2>
									{#if b.status === 'stale'}<StatusBadge status={b.status} />{/if}
								</div>
								<p class="text-xs text-zinc-500">
									{#if b.spec.address}{b.spec.address} ·
									{/if}{planLabel(b.spec.plan)} · staged 3D
								</p>
								{#if b.spec.summary}<p
										class="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400"
									>
										{b.spec.summary}
									</p>{/if}
								{#if b.spec.highlights?.length}
									<ul class="flex flex-wrap gap-1 pt-0.5">
										{#each b.spec.highlights as h (h)}<li
												class="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-300"
											>
												{h}
											</li>{/each}
									</ul>
								{/if}
							</div>
						</a>
						<div class="flex items-center gap-3 px-4 pt-2 pb-3 text-xs text-zinc-500">
							<a
								data-testid="blueprint-conversation"
								href="/c/{b.conversationId}?a={b.id}"
								class="min-w-0 flex-1 truncate hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
								>From: {b.conversationTitle}</a
							>
							<a
								data-testid="blueprint-floorplan"
								href={viewerHref(b)}
								class="shrink-0 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
								>Floor plan 3D</a
							>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p data-testid="blueprints-empty" class="mt-10 text-center text-sm text-zinc-500">
				No blueprints yet. Ask the agent for help finding an apartment and it can attach a 3D layout
				here.
			</p>
		{/if}

		<p class="mt-8 text-xs text-zinc-400">
			Also: <a href="/plans/view" class="hover:underline">all sample layouts</a> ·
			<a href="/plans/room" class="hover:underline">showcase room</a>
		</p>
	</div>
</div>
