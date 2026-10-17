<script lang="ts">
	import { browser } from '$app/env';
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';

	let { source, class: className = '' }: { source: string; class?: string } = $props();

	// Model output is untrusted: sanitize in the browser; the server renders plain text.
	const html = $derived(
		browser ? DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true })) : ''
	);
</script>

<div
	data-testid="markdown"
	class="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-zinc-900 {className}"
>
	{#if browser}
		{@html html}
	{:else}
		<p class="whitespace-pre-wrap">{source}</p>
	{/if}
</div>
