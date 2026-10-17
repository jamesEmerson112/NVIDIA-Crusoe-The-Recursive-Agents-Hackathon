<script lang="ts">
	import { goto } from '$app/navigation';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let q = $state(data.q);
	let timer: ReturnType<typeof setTimeout>;

	function search(next: { q?: string; kind?: string | null }) {
		const params = new URLSearchParams();
		const query = next.q ?? q;
		const kind = next.kind === undefined ? data.kind : next.kind;
		if (query) params.set('q', query);
		if (kind) params.set('kind', kind);
		goto(`/library${params.size ? `?${params}` : ''}`, { replace: true, reset: false });
	}

	const kinds = [
		{ value: null, label: 'All' },
		{ value: 'form', label: 'Forms' },
		{ value: 'document', label: 'Documents' },
		{ value: 'widget', label: 'Widgets' },
		{ value: 'html', label: 'Interactive' }
	];
	const kindLabel = {
		form: 'Form',
		widget: 'Widget',
		document: 'Document',
		html: 'Interactive',
		blueprint: 'Blueprint'
	};
	const when = (d: Date) =>
		new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<svelte:head><title>Library · Workbench</title></svelte:head>

<div data-testid="library-root" class="min-w-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-3xl px-5 py-8">
		<h1 data-testid="library-heading" class="text-2xl font-semibold tracking-tight">Library</h1>
		<p class="mt-1 text-sm text-zinc-500">
			Everything the agent has made or asked you, across all conversations.
		</p>

		<input
			data-testid="library-search"
			type="search"
			class="mt-5 w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
			placeholder="Search titles, answers and content…"
			bind:value={q}
			oninput={() => {
				clearTimeout(timer);
				timer = setTimeout(() => search({ q }), 200);
			}}
		/>
		<div data-testid="library-kinds" class="mt-3 flex flex-wrap gap-1.5">
			{#each kinds as k (k.label)}
				<button
					data-testid="library-kind"
					class="rounded-full px-3 py-1 text-xs font-medium {data.kind === k.value
						? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
						: 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}"
					onclick={() => search({ kind: k.value })}>{k.label}</button
				>
			{/each}
		</div>

		<ul data-testid="library-results" class="mt-5 space-y-2">
			{#each data.results as r (r.id)}
				<li>
					<a
						data-testid="library-result"
						href="/c/{r.conversationId}?a={r.id}"
						class="block rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
					>
						<div class="flex items-center gap-2">
							<span class="min-w-0 flex-1 truncate font-medium">{r.title}</span>
							{#if r.status !== 'ready'}<StatusBadge status={r.status} />{/if}
							<span class="text-xs text-zinc-400">{when(r.updatedAt)}</span>
						</div>
						<p class="mt-0.5 truncate text-xs text-zinc-500">
							{kindLabel[r.kind]}{r.kind === 'form' || r.kind === 'widget' ? '' : ` v${r.version}`} ·
							{r.conversationTitle}{r.stepTitle ? ` · Step ${r.stepPosition}: ${r.stepTitle}` : ''}
						</p>
						{#if r.snippet}<p class="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
								{r.snippet}
							</p>{/if}
					</a>
				</li>
			{:else}
				<li data-testid="library-empty" class="py-10 text-center text-sm text-zinc-500">
					{data.q
						? `Nothing matches “${data.q}”.`
						: 'No artifacts yet. Start a conversation and they will collect here.'}
				</li>
			{/each}
		</ul>
	</div>
</div>
