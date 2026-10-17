<script lang="ts">
	import {
		buildRunLog,
		formatCost,
		formatDuration,
		formatPercent,
		formatTokens,
		shortModel,
		SLOW_MS
	} from '#lib/client/run-log.ts';
	import type { ConversationState } from '#lib/server/store.ts';

	let {
		conversation: cs,
		onopen
	}: { conversation: ConversationState; onopen: (id: string) => void } = $props();

	// Re-derives on every `app:conversation` invalidate, so it fills in live during a run.
	const log = $derived(
		buildRunLog({ calls: cs.calls, messages: cs.messages, artifacts: cs.artifacts })
	);
	const clock = (t: number) =>
		new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<div data-testid="run-log" class="flex h-full flex-col">
	<header class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
		<h2 class="text-sm font-semibold">Run log</h2>
		<p data-testid="run-log-summary" class="text-xs text-zinc-500">
			Every model call, oldest first. Calls over {SLOW_MS / 1000} s are amber; failed tool results are
			red.
		</p>
	</header>
	{#if !log.rows.length}
		<p data-testid="run-log-empty" class="px-5 py-6 text-center text-sm text-zinc-500">
			Model calls appear here once the agent starts working.
		</p>
	{:else}
		<div data-testid="run-log-scroll" class="min-h-0 flex-1 overflow-auto">
			<table data-testid="run-log-table" class="w-full text-left text-[11px] whitespace-nowrap">
				<thead
					class="sticky top-0 bg-zinc-100 text-[10px] tracking-wide text-zinc-500 uppercase dark:bg-zinc-900"
				>
					<tr>
						<th class="px-2 py-1.5 font-medium">#</th>
						<th class="px-2 py-1.5 font-medium">Time</th>
						<th class="px-2 py-1.5 font-medium">Role</th>
						<th class="px-2 py-1.5 font-medium">Model</th>
						<th class="px-2 py-1.5 text-right font-medium">Prompt</th>
						<th class="px-2 py-1.5 text-right font-medium">Cached</th>
						<th class="px-2 py-1.5 text-right font-medium">Out</th>
						<th class="px-2 py-1.5 text-right font-medium">Cache</th>
						<th class="px-2 py-1.5 text-right font-medium">Cost</th>
						<th class="px-2 py-1.5 text-right font-medium">Time</th>
						<th class="px-2 py-1.5 font-medium">Did</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
					{#each log.rows as r, i (r.id)}
						<tr
							data-testid="run-log-row"
							class="tabular-nums {r.slow ? 'bg-amber-50 dark:bg-amber-950/30' : ''}"
						>
							<td class="px-2 py-1 text-zinc-400">{i + 1}</td>
							<td data-testid="run-log-time" class="px-2 py-1 text-zinc-500">{clock(r.time)}</td>
							<td data-testid="run-log-role" class="px-2 py-1">
								<span
									class="rounded px-1 py-0.5 {r.role === 'agent'
										? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
										: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200'}"
									>{r.role === 'agent' ? 'agent' : 'sub-agent'}</span
								>
							</td>
							<td data-testid="run-log-model" class="px-2 py-1" title={r.model}
								>{shortModel(r.model)}</td
							>
							<td class="px-2 py-1 text-right">{formatTokens(r.promptTokens)}</td>
							<td class="px-2 py-1 text-right">{formatTokens(r.cachedTokens)}</td>
							<td class="px-2 py-1 text-right">{formatTokens(r.completionTokens)}</td>
							<td data-testid="run-log-cache-hit" class="px-2 py-1 text-right"
								>{formatPercent(r.cacheHit)}</td
							>
							<td data-testid="run-log-cost" class="px-2 py-1 text-right"
								>{formatCost(r.costUsd)}</td
							>
							<td
								data-testid="run-log-duration"
								class="px-2 py-1 text-right {r.slow
									? 'font-semibold text-amber-700 dark:text-amber-400'
									: ''}">{formatDuration(r.durationMs)}</td
							>
							<td data-testid="run-log-did" class="px-2 py-1">
								{#if r.patched}
									{@const p = r.patched}
									<button
										data-testid="run-log-artifact"
										class="max-w-48 truncate text-left text-violet-700 hover:underline dark:text-violet-300"
										title="Open {p.title}"
										onclick={() => onopen(p.id)}>patched {p.title} v{p.version}</button
									>
								{:else if r.tools.length}
									<span class="flex flex-wrap gap-1">
										{#each r.tools as t, j (j)}
											<span
												data-testid="run-log-tool"
												title={t.error}
												class="rounded px-1 py-0.5 font-mono {t.failed
													? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
													: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}"
												>{t.name}{t.failed ? ' ✕' : ''}</span
											>
										{/each}
									</span>
								{:else if r.role === 'agent'}
									<span class="text-zinc-400">reply</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot
					class="sticky bottom-0 border-t border-zinc-300 bg-zinc-100 font-semibold tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
				>
					<tr data-testid="run-log-totals">
						<td class="px-2 py-1.5" colspan="4">
							{log.totals.calls} calls{#if log.totals.slow}
								· <span class="text-amber-700 dark:text-amber-400">{log.totals.slow} slow</span
								>{/if}{#if log.totals.failedTools}
								·
								<span class="text-red-700 dark:text-red-400"
									>{log.totals.failedTools} failed tool{log.totals.failedTools === 1
										? ''
										: 's'}</span
								>{/if}
						</td>
						<td class="px-2 py-1.5 text-right">{formatTokens(log.totals.promptTokens)}</td>
						<td class="px-2 py-1.5 text-right">{formatTokens(log.totals.cachedTokens)}</td>
						<td class="px-2 py-1.5 text-right">{formatTokens(log.totals.completionTokens)}</td>
						<td class="px-2 py-1.5 text-right">{formatPercent(log.totals.cacheHit)}</td>
						<td class="px-2 py-1.5 text-right">{formatCost(log.totals.costUsd)}</td>
						<td class="px-2 py-1.5 text-right">{formatDuration(log.totals.durationMs)}</td>
						<td></td>
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}
</div>
