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
	</div>
</div>
