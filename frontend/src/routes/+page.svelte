<script lang="ts">
	import { goto } from '$app/navigation';
	import { live, startRun } from '#lib/client/run.svelte.ts';
	import Composer from '#lib/components/Composer.svelte';

	let creating = $state(false);

	async function send(content: string) {
		creating = true;
		const { id } = await (await fetch('/api/conversations', { method: 'POST' })).json();
		await goto(`/c/${id}`);
		startRun(id, { type: 'message', content });
	}
</script>

<div class="flex flex-1 flex-col items-center justify-center px-5">
	<div class="w-full max-w-2xl space-y-6">
		<div class="space-y-2 text-center">
			<h1 class="text-3xl font-semibold tracking-tight">What are we working on?</h1>
			<p class="text-sm text-zinc-500">
				The agent plans the work, asks for details with forms, and files everything it makes into a
				process you can come back to.
			</p>
		</div>
		<Composer busy={creating || live.running} onsend={send} />
	</div>
</div>
