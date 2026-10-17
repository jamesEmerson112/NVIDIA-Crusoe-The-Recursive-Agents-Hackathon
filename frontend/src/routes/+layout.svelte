<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { live } from '#lib/client/run.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const when = (d: Date) => {
		const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
		return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
	};

	async function remove(id: string) {
		if (!confirm('Delete this conversation and its artifacts?')) return;
		await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
		await invalidate('app:conversations');
		if (page.params.id === id) goto('/');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Workbench</title>
</svelte:head>

<div class="flex h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
	<nav
		class="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
	>
		<div class="p-3">
			<a
				href="/"
				class="block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
				>+ New conversation</a
			>
		</div>
		<ul class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
			{#each data.conversations as c (c.id)}
				<li class="group relative">
					<a
						href="/c/{c.id}"
						class="block rounded-lg px-3 py-2 pr-8 text-sm {page.params.id === c.id
							? 'bg-zinc-200 dark:bg-zinc-800'
							: 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60'}"
					>
						<span class="block truncate">{c.title}</span>
						<span class="flex items-center gap-1.5 text-[11px] text-zinc-500">
							{#if live.running && live.cid === c.id}<span
									class="size-1.5 animate-pulse rounded-full bg-emerald-600"
								></span>Working ·{/if}
							{when(c.updatedAt)}
						</span>
					</a>
					<button
						class="absolute top-2 right-2 hidden rounded px-1 text-zinc-400 group-hover:block hover:text-rose-600"
						aria-label="Delete conversation"
						onclick={() => remove(c.id)}>✕</button
					>
				</li>
			{/each}
		</ul>
		{#if data.mock}
			<p
				class="m-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
			>
				Mock agent: set <code>CRUSOE_API_KEY</code> in <code>frontend/.env</code> to use Crusoe.
			</p>
		{/if}
	</nav>
	<main class="flex min-w-0 flex-1">
		{@render children()}
	</main>
</div>
