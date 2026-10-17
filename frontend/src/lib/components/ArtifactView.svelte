<script lang="ts">
	import type { ConversationState } from '#lib/server/store.ts';
	import { lineDiff, withContext } from '#lib/diff.ts';
	import type { FormSpec } from '#lib/types.ts';
	import FormView from './FormView.svelte';
	import Markdown from './Markdown.svelte';
	import StatusBadge from './StatusBadge.svelte';

	type Artifact = ConversationState['artifacts'][number];

	let {
		artifact,
		all,
		busy,
		onopen,
		onclose,
		onedit
	}: {
		artifact: Artifact;
		all: Artifact[];
		busy: boolean;
		onopen: (id: string) => void;
		onclose: () => void;
		onedit: (edit: { values?: Record<string, unknown>; content?: string }) => void;
	} = $props();

	let selected = $state<number | null>(null);
	let editing = $state(false);
	let draft = $state('');
	let showChanges = $state(false);

	// Reset local view state when another artifact is opened.
	let lastId = '';
	$effect.pre(() => {
		if (artifact.id !== lastId) {
			lastId = artifact.id;
			selected = null;
			editing = false;
			showChanges = false;
		}
	});

	const version = $derived(
		artifact.versions.find((v) => v.version === (selected ?? artifact.currentVersion)) ??
			artifact.versions[0]
	);
	const previous = $derived(artifact.versions.find((v) => v.version === version.version - 1));
	// Answers that differ from the previous version, for forms that had answers before.
	const changedFields = $derived(
		new Set(
			previous?.data && version.data
				? Object.keys({ ...previous.data, ...version.data }).filter(
						(k) => JSON.stringify(previous.data?.[k]) !== JSON.stringify(version.data?.[k])
					)
				: []
		)
	);
	const diff = $derived(
		showChanges && previous && artifact.kind !== 'form'
			? withContext(lineDiff(previous.content, version.content))
			: []
	);
	const isCurrent = $derived(version.version === artifact.currentVersion);
	const upstream = $derived(all.filter((a) => artifact.upstream.includes(a.id)));
	const downstream = $derived(all.filter((a) => a.upstream.includes(artifact.id)));
	const spec = $derived(
		artifact.kind === 'form' ? (JSON.parse(version.content) as FormSpec) : null
	);

	// The HTML artifact runs scripts in an opaque-origin iframe with no network access.
	const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;

	const when = (d: Date | string) =>
		new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	const display = (v: unknown) =>
		Array.isArray(v)
			? v.join(', ') || '—'
			: v === true
				? 'Yes'
				: v === false
					? 'No'
					: v === undefined || v === null || v === ''
						? '—'
						: String(v);
	const authorLabel = { agent: 'Agent', user: 'You', subagent: 'Sub-agent' };
	const kindLabel = { form: 'Form', document: 'Document', html: 'Interactive' };
</script>

<div class="flex h-full flex-col">
	<header class="flex items-start gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
		<div class="min-w-0 flex-1">
			<div class="mb-1 flex items-center gap-2 text-xs text-zinc-500">
				<span>{kindLabel[artifact.kind]}</span>
				<span>·</span>
				<span>{artifact.id}</span>
				<StatusBadge status={artifact.status} />
			</div>
			<h2 class="truncate text-lg font-semibold">{artifact.title}</h2>
		</div>
		<button
			class="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
			onclick={onclose}
			aria-label="Close artifact">✕</button
		>
	</header>

	<div
		class="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 px-5 py-2 dark:border-zinc-800"
	>
		<span class="text-xs text-zinc-500">Versions</span>
		{#each [...artifact.versions].reverse() as v (v.id)}
			<button
				class="rounded-md px-2 py-0.5 text-xs whitespace-nowrap {v.version === version.version
					? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
					: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}"
				title="{v.note ?? ''} · {authorLabel[v.author]} · {when(v.createdAt)}"
				onclick={() => {
					selected = v.version;
					editing = false;
				}}
			>
				v{v.version}
			</button>
		{/each}
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
		<p class="mb-4 text-xs text-zinc-500">
			v{version.version} · {version.note} · {authorLabel[version.author]}{version.model
				? ` (${version.model})`
				: ''} · {when(version.createdAt)}
			{#if version.costUsd > 0}· ${version.costUsd.toFixed(5)}{/if}
			{#if previous && artifact.kind !== 'form' && !editing}
				·
				<button
					class="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
					onclick={() => (showChanges = !showChanges)}
				>
					{showChanges ? 'Hide changes' : `Show changes since v${previous.version}`}
				</button>
			{/if}
		</p>

		{#if artifact.status === 'stale' && isCurrent}
			<div
				class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
			>
				Something this was built from has changed. The agent is deciding whether to update it.
			</div>
		{/if}

		{#if spec}
			{#key `${version.id}-${editing}`}
				{#if artifact.status === 'awaiting_input'}
					<p class="text-sm text-zinc-500">
						Waiting for your answers. Fill in the form in the chat.
					</p>
				{:else if editing}
					<FormView
						{spec}
						values={version.data}
						submitLabel="Save and tell the agent"
						disabled={busy}
						onsubmit={(values) => {
							editing = false;
							onedit({ values });
						}}
						oncancel={() => (editing = false)}
					/>
				{:else}
					<dl class="space-y-3">
						{#each spec.fields as f (f.name)}
							<div
								class={changedFields.has(f.name)
									? '-mx-2 rounded-md bg-amber-500/10 px-2 py-1'
									: ''}
							>
								<dt class="text-xs font-medium text-zinc-500">
									{f.label}
									{#if changedFields.has(f.name)}<span class="text-amber-700 dark:text-amber-400">
											· changed in v{version.version}</span
										>{/if}
								</dt>
								<dd class="text-sm whitespace-pre-wrap">
									{display(version.data?.[f.name])}
								</dd>
								{#if changedFields.has(f.name)}
									<dd class="text-xs text-zinc-500 line-through">
										{display(previous?.data?.[f.name])}
									</dd>
								{/if}
							</div>
						{/each}
					</dl>
				{/if}
			{/key}
		{:else if editing}
			<textarea
				class="h-96 w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
				bind:value={draft}></textarea>
			<div class="mt-2 flex gap-2">
				<button
					class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
					disabled={busy}
					onclick={() => {
						editing = false;
						onedit({ content: draft });
					}}>Save and tell the agent</button
				>
				<button
					class="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
					onclick={() => (editing = false)}>Cancel</button
				>
			</div>
		{:else if showChanges}
			<pre
				class="overflow-x-auto rounded-lg border border-zinc-200 bg-white py-2 font-mono text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-900">{#each diff as line, i (i)}{#if line === null}<span
							class="block px-3 text-zinc-400">⋯</span
						>{:else}<span
							class="block px-3 whitespace-pre-wrap {line.type === 'add'
								? 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
								: line.type === 'del'
									? 'bg-rose-500/15 text-rose-900 line-through dark:text-rose-200'
									: ''}"
							>{line.type === 'add' ? '+ ' : line.type === 'del' ? '− ' : '  '}{line.text ||
								' '}</span
						>{/if}{/each}</pre>
		{:else if artifact.kind === 'html'}
			<iframe
				title={artifact.title}
				sandbox="allow-scripts"
				srcdoc={CSP + version.content}
				class="h-[520px] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
			></iframe>
		{:else}
			<Markdown source={version.content} />
		{/if}
	</div>

	<footer class="space-y-3 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
		{#if upstream.length || downstream.length}
			<div class="space-y-1 text-xs">
				{#if upstream.length}
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="text-zinc-500">Built from</span>
						{#each upstream as u (u.id)}
							<button
								class="rounded-md bg-zinc-100 px-2 py-0.5 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
								onclick={() => onopen(u.id)}>{u.title}</button
							>
						{/each}
					</div>
				{/if}
				{#if downstream.length}
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="text-zinc-500">Feeds into</span>
						{#each downstream as d (d.id)}
							<button
								class="rounded-md bg-zinc-100 px-2 py-0.5 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
								onclick={() => onopen(d.id)}>{d.title}</button
							>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		{#if !editing && artifact.status !== 'awaiting_input'}
			<div class="flex items-center gap-2">
				<button
					class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
					disabled={busy}
					onclick={() => {
						draft = version.content;
						editing = true;
					}}
				>
					{isCurrent ? 'Edit' : `Edit from v${version.version}`}
				</button>
				{#if downstream.length}
					<span class="text-xs text-zinc-500"
						>Changes flag {downstream.length} dependent artifact{downstream.length > 1 ? 's' : ''} for
						review.</span
					>
				{/if}
			</div>
		{/if}
	</footer>
</div>
