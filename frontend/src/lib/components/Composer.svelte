<script lang="ts">
	let {
		busy,
		onsend,
		onstop,
		placeholder = 'Describe what you want to get done…'
	}: {
		busy: boolean;
		onsend: (text: string) => void;
		onstop?: () => void;
		placeholder?: string;
	} = $props();

	let text = $state('');

	function send() {
		const t = text.trim();
		if (!t || busy) return;
		text = '';
		onsend(t);
	}
</script>

<div
	class="rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
>
	<textarea
		class="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
		{placeholder}
		bind:value={text}
		onkeydown={(e) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
				e.preventDefault();
				send();
			}
		}}></textarea>
	<div class="flex items-center justify-end gap-2">
		<span class="mr-auto px-2 text-[11px] text-zinc-400"
			>Enter to send · Shift+Enter for a new line</span
		>
		{#if busy && onstop}
			<button
				class="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
				onclick={onstop}>Stop</button
			>
		{:else}
			<button
				class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
				disabled={!text.trim() || busy}
				onclick={send}>Send</button
			>
		{/if}
	</div>
</div>
