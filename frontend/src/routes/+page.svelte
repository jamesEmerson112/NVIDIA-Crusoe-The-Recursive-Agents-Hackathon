<script lang="ts">
	import { goto } from '$app/navigation';
	import { live, startRun } from '#lib/client/run.svelte.ts';
	import Composer from '#lib/components/Composer.svelte';
	import SanFrancisco3D from '#lib/components/SanFrancisco3D.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let creating = $state(false);

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
		<!-- A soft frosted patch behind the heading keeps it legible over the animated map: blurred,
		     lightly tinted, with a radial mask so its edges fade out instead of forming a box. -->
		<h1
			data-testid="start-heading"
			class="relative isolate mx-auto w-fit text-center text-3xl font-normal tracking-tight"
		>
			<span
				aria-hidden="true"
				class="absolute -inset-x-24 -inset-y-12 -z-10 bg-white/75 [mask-image:radial-gradient(closest-side,black_50%,transparent)] backdrop-blur-xl dark:bg-zinc-950/60"
			></span>
			What's on your mind today?
		</h1>
		<Composer
			variant="hero"
			model={data.model}
			placeholder="Ask anything"
			busy={creating || live.running}
			onsend={send}
		/>
	</div>
</div>
