<script lang="ts">
	import type { ConversationState } from '#lib/server/store.ts';
	import StatusBadge from './StatusBadge.svelte';

	let {
		artifact,
		label,
		onopen
	}: { artifact: ConversationState['artifacts'][number]; label: string; onopen: () => void } =
		$props();
	const kind = { form: 'Form', widget: 'Widget', document: 'Document', html: 'Interactive' };
</script>

<button
	data-testid="artifact-card-open"
	class="group flex w-full max-w-md items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
	onclick={onopen}
>
	<span
		class="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
	>
		{kind[artifact.kind][0]}
	</span>
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm font-medium">{artifact.title}</span>
		<span class="block text-xs text-zinc-500"
			>{label} · {kind[artifact.kind]}{artifact.kind === 'form' || artifact.kind === 'widget'
				? ''
				: ` · v${artifact.currentVersion}`}</span
		>
	</span>
	{#if artifact.status !== 'ready'}<StatusBadge status={artifact.status} />{/if}
	<span class="text-zinc-400 group-hover:text-zinc-600">›</span>
</button>
