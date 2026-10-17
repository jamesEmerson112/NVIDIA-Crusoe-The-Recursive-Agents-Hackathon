<script lang="ts">
	import type { MessageMeta } from '#lib/types.ts';

	type Proposal = Extract<MessageMeta, { kind: 'proposal' }>;

	let {
		proposal,
		titles,
		answer,
		busy,
		onanswer,
		onopen
	}: {
		proposal: Proposal;
		titles: Map<string, string>;
		/** `undefined` while the user hasn't answered. */
		answer: boolean | undefined;
		busy: boolean;
		onanswer: (approved: boolean) => void;
		onopen: (id: string) => void;
	} = $props();

	const money = (usd: number) => `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`;
	const secs = (ms: number) =>
		ms < 60_000 ? `~${Math.max(1, Math.round(ms / 1000))}s` : `~${Math.round(ms / 60_000)} min`;
</script>

<div
	data-testid="proposal-card"
	class="max-w-xl rounded-2xl border bg-white p-5 shadow-sm dark:bg-zinc-900 {answer === undefined
		? 'border-amber-300 dark:border-amber-800'
		: 'border-zinc-200 dark:border-zinc-800'}"
>
	<p class="mb-1 text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
		Redo needs your OK
	</p>
	<p class="text-sm font-medium">{proposal.summary}</p>
	<p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{proposal.plan}</p>

	<div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
		<span class="text-zinc-500">Would redo</span>
		{#each proposal.artifactIds as id (id)}
			<button
				data-testid="proposal-open-artifact"
				class="rounded-md bg-zinc-100 px-2 py-0.5 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
				onclick={() => onopen(id)}
			>
				{titles.get(id) ?? id}
			</button>
		{/each}
	</div>

	<dl class="mt-3 flex gap-6 text-sm">
		<div>
			<dt class="text-xs text-zinc-500">Estimated cost</dt>
			<dd data-testid="proposal-cost" class="font-semibold tabular-nums">
				{money(proposal.costUsd)}
			</dd>
		</div>
		<div>
			<dt class="text-xs text-zinc-500">Estimated time</dt>
			<dd data-testid="proposal-duration" class="font-semibold tabular-nums">
				{secs(proposal.durationMs)}
			</dd>
		</div>
	</dl>

	{#if answer === undefined}
		<div class="mt-4 flex gap-2">
			<button
				data-testid="proposal-approve"
				class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
				disabled={busy}
				onclick={() => onanswer(true)}>Approve redo</button
			>
			<button
				data-testid="proposal-keep"
				class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
				disabled={busy}
				onclick={() => onanswer(false)}>Keep current version</button
			>
		</div>
	{:else}
		<p
			data-testid="proposal-answer"
			class="mt-4 text-sm font-medium {answer
				? 'text-emerald-700 dark:text-emerald-400'
				: 'text-zinc-500'}"
		>
			{answer ? '✓ Approved' : 'Kept the current version'}
		</p>
	{/if}
</div>
