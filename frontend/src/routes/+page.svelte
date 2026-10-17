<script lang="ts">
	import { goto } from '$app/navigation';
	import { live, startRun } from '#lib/client/run.svelte.ts';
	import Composer from '#lib/components/Composer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let creating = $state(false);

	// One-click starters; each opens a conversation that exercises the run API.
	const examples = [
		'Find me a 1-bedroom in SF under $3,500 near Caltrain',
		'Plan a team offsite for 8 people in SF next month',
		'Compare Mission vs Sunset for a renter with a dog',
		'Write a detailed moving checklist for a cross-country move'
	];

	async function send(content: string) {
		creating = true;
		const { id } = await (await fetch('/api/conversations', { method: 'POST' })).json();
		await goto(`/c/${id}`);
		startRun(id, { type: 'message', content });
	}
</script>

<div class="flex flex-1 flex-col items-center justify-center px-5">
	<div class="w-full max-w-3xl space-y-8">
		<h1 class="text-center text-3xl font-normal tracking-tight">What's on your mind today?</h1>
		<Composer
			variant="hero"
			model={data.model}
			placeholder="Ask anything"
			busy={creating || live.running}
			onsend={send}
		/>
		<div class="flex flex-wrap justify-center gap-2">
			{#each examples as prompt (prompt)}
				<button
					class="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
					disabled={creating || live.running}
					onclick={() => send(prompt)}>{prompt}</button
				>
			{/each}
		</div>
	</div>
</div>
