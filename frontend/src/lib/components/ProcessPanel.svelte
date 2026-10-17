<script lang="ts">
	import type { ConversationState } from '#lib/server/store.ts';
	import StatusBadge from './StatusBadge.svelte';

	let {
		conversation: cs,
		onopen
	}: { conversation: ConversationState; onopen: (id: string) => void } = $props();

	const groups = $derived([
		...cs.steps.map((s) => ({
			step: s,
			items: cs.artifacts.filter((a) => a.stepId === s.id)
		})),
		{ step: null, items: cs.artifacts.filter((a) => !a.stepId) }
	]);
	const icon = { pending: '○', active: '◐', done: '●', stale: '◌' };
	const iconColor = {
		pending: 'text-zinc-400',
		active: 'text-sky-600 animate-pulse',
		done: 'text-emerald-600',
		stale: 'text-amber-500'
	};
	const kindIcon = { form: '☰', widget: '◈', document: '¶', html: '◇', blueprint: '⌂' };
</script>

<div data-testid="process-panel" class="flex h-full flex-col">
	<header class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
		<h2 class="text-sm font-semibold">Process</h2>
		<p class="text-xs text-zinc-500">
			The plan and everything it produced. Click any artifact to revisit it.
		</p>
	</header>
	<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
		{#if !cs.steps.length && !cs.artifacts.length}
			<p data-testid="process-empty" class="px-2 py-6 text-center text-sm text-zinc-500">
				The plan appears here once the agent starts working.
			</p>
		{/if}
		<ol class="space-y-1">
			{#each groups as g (g.step?.id ?? 'loose')}
				{#if g.step || g.items.length}
					<li data-testid="process-step" class="rounded-lg px-2 py-2">
						{#if g.step}
							<div class="flex items-start gap-2">
								<span
									data-testid="process-step-status"
									class="mt-0.5 w-4 text-center {iconColor[g.step.status]}"
									>{icon[g.step.status]}</span
								>
								<div class="min-w-0 flex-1">
									<p
										data-testid="process-step-title"
										class="text-sm font-medium {g.step.status === 'done' ? 'text-zinc-500' : ''}"
									>
										{g.step.position}. {g.step.title}
									</p>
									{#if g.step.summary}<p class="text-xs text-zinc-500">{g.step.summary}</p>{/if}
								</div>
							</div>
						{:else}
							<p class="px-6 text-xs font-medium tracking-wide text-zinc-500 uppercase">
								Other artifacts
							</p>
						{/if}
						{#if g.items.length}
							<ul class="mt-1.5 space-y-1 pl-6">
								{#each g.items as a (a.id)}
									<li>
										<button
											data-testid="process-artifact"
											class="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
											onclick={() => onopen(a.id)}
										>
											<span class="text-zinc-400">{kindIcon[a.kind]}</span>
											<span class="min-w-0 flex-1 truncate">{a.title}</span>
											{#if a.kind !== 'form' && a.kind !== 'widget'}<span
													class="text-[11px] text-zinc-400">v{a.currentVersion}</span
												>{/if}
											{#if a.status !== 'ready'}<StatusBadge status={a.status} />{/if}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/if}
			{/each}
		</ol>
	</div>
	<footer
		data-testid="process-usage"
		class="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800"
	>
		{cs.usage.calls} model calls · ${cs.usage.costUsd.toFixed(4)}
		{#if cs.usage.promptTokens}
			· {Math.round((100 * cs.usage.cachedTokens) / cs.usage.promptTokens)}% prompt cache hits
		{/if}
	</footer>
</div>
