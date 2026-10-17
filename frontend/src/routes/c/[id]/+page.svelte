<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { live } from '#lib/client/run.svelte.ts';
	import Workspace from '#lib/components/Workspace.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// A run started elsewhere (another tab, or before a reload) keeps going on the server: poll until it ends.
	$effect(() => {
		if (!data.running || live.running) return;
		const timer = setInterval(() => invalidate('app:conversation'), 1500);
		return () => clearInterval(timer);
	});
</script>

<Workspace conversation={data.state} />
