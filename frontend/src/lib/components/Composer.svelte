<script lang="ts">
	let {
		busy,
		onsend,
		onstop,
		placeholder = 'Describe what you want to get done…',
		variant = 'default',
		model = null
	}: {
		busy: boolean;
		onsend: (text: string) => void;
		onstop?: () => void;
		placeholder?: string;
		/** `hero` is the ChatGPT-style pill used on the start page. */
		variant?: 'default' | 'hero';
		/** Agent model id shown as a label in the hero variant; null means the mock agent. */
		model?: string | null;
	} = $props();

	let text = $state('');

	const modelLabel = $derived(model ? model.split('/').pop() : 'Mock agent');

	function send() {
		const t = text.trim();
		if (!t || busy) return;
		text = '';
		onsend(t);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}
</script>

{#if variant === 'hero'}
	<div
		data-testid="composer"
		class="flex items-end gap-2 rounded-[28px] bg-zinc-100 py-2 pr-2 pl-5 focus-within:ring-1 focus-within:ring-zinc-300 dark:bg-zinc-800 dark:focus-within:ring-zinc-600"
	>
		<textarea
			data-testid="composer-input"
			class="field-sizing-content max-h-48 min-h-10 flex-1 resize-none self-center bg-transparent py-2 text-base outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
			rows="1"
			{placeholder}
			bind:value={text}
			{onkeydown}></textarea>
		<span
			data-testid="composer-model"
			class="mb-2.5 shrink-0 text-sm text-zinc-500 max-sm:hidden dark:text-zinc-400"
			title={model ?? 'No CRUSOE_API_KEY: the scripted mock agent answers'}>{modelLabel}</span
		>
		{#if busy && onstop}
			<button
				data-testid="composer-stop"
				class="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600 dark:hover:bg-zinc-500"
				aria-label="Stop"
				onclick={onstop}
			>
				<span class="size-3 rounded-sm bg-zinc-900 dark:bg-zinc-100"></span>
			</button>
		{:else}
			<button
				data-testid="composer-send"
				class="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
				aria-label="Send"
				disabled={!text.trim() || busy}
				onclick={send}
			>
				<svg
					viewBox="0 0 24 24"
					class="size-5"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
				>
					<path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		{/if}
	</div>
{:else}
	<div
		data-testid="composer"
		class="rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
	>
		<textarea
			data-testid="composer-input"
			class="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
			{placeholder}
			bind:value={text}
			{onkeydown}></textarea>
		<div class="flex items-center justify-end gap-2">
			<span class="mr-auto px-2 text-[11px] text-zinc-400"
				>Enter to send · Shift+Enter for a new line</span
			>
			{#if busy && onstop}
				<button
					data-testid="composer-stop"
					class="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
					onclick={onstop}>Stop</button
				>
			{:else}
				<button
					data-testid="composer-send"
					class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
					disabled={!text.trim() || busy}
					onclick={send}>Send</button
				>
			{/if}
		</div>
	</div>
{/if}
