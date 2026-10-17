<script lang="ts">
	import { goto } from '$app/navigation';
	import { live, startRun } from '#lib/client/run.svelte.ts';
	import Composer from '#lib/components/Composer.svelte';
	import SanFrancisco3D from '#lib/components/SanFrancisco3D.svelte';
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

<div
	data-testid="start-root"
	class="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-5"
>
	<SanFrancisco3D />
	<div class="relative w-full max-w-3xl space-y-8">
		<h1 data-testid="start-heading" class="text-center text-3xl font-normal tracking-tight">
			<!-- Apple-style glass pill (blur, saturation, light rim) so the heading reads over the SF map. -->
			<span
				class="inline-block rounded-full border border-white/70 bg-gradient-to-b from-white/60 to-white/25 px-7 py-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-1px_1px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/15 dark:from-white/15 dark:to-white/5 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_8px_30px_rgba(0,0,0,0.4)]"
				>What's on your mind today?</span
			>
		</h1>
		<Composer
			variant="hero"
			model={data.model}
			placeholder="Ask anything"
			busy={creating || live.running}
			onsend={send}
		/>
		<div data-testid="start-examples" class="flex flex-wrap justify-center gap-2">
			{#each examples as prompt (prompt)}
				<button
					data-testid="start-example"
					class="rounded-full border border-zinc-300 bg-white/80 px-3 py-1.5 text-sm text-zinc-600 backdrop-blur-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
					disabled={creating || live.running}
					onclick={() => send(prompt)}>{prompt}</button
				>
			{/each}
		</div>
	</div>
</div>
