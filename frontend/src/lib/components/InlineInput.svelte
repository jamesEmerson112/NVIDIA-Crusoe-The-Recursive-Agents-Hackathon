<script lang="ts">
	import { saveQuestions, type RunBody } from '#lib/client/run.svelte.ts';
	import type { ConversationState } from '#lib/server/store.ts';
	import type { FormSpec, WidgetSpec } from '#lib/types.ts';
	import FormView from './FormView.svelte';
	import QuestionEditor from './QuestionEditor.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import Widget from './Widget.svelte';

	type Artifact = ConversationState['artifacts'][number];

	let {
		artifact: a,
		cid,
		busy,
		run,
		onopen
	}: {
		/** A form or widget, embedded in the chat where the agent asked for it. */
		artifact: Artifact;
		cid: string;
		busy: boolean;
		run: (body: RunBody) => void;
		onopen: () => void;
	} = $props();

	let mode = $state<'view' | 'answers' | 'questions'>('view');
	let error = $state('');

	const v = $derived(a.versions.find((x) => x.version === a.currentVersion) ?? a.versions[0]);
	const pending = $derived(a.status === 'awaiting_input');
	const form = $derived(a.kind === 'form' ? (JSON.parse(v.content) as FormSpec) : null);
	const widget = $derived(a.kind === 'widget' ? (JSON.parse(v.content) as WidgetSpec) : null);

	// Answers go through form_submit either way; for an answered artifact the server turns it into an edit.
	function submit(values: Record<string, unknown>) {
		mode = 'view';
		run({ type: 'form_submit', artifactId: a.id, values });
	}

	async function saveSpec(spec: FormSpec) {
		error = '';
		if (pending) {
			try {
				await saveQuestions(cid, a.id, spec);
				mode = 'view';
			} catch (err) {
				error = (err as Error).message;
			}
		} else {
			mode = 'view';
			run({ type: 'artifact_edit', artifactId: a.id, spec });
		}
	}

	const link =
		'shrink-0 rounded-md px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';
</script>

<div
	data-testid="inline-input"
	class="max-w-xl rounded-2xl border bg-white p-5 shadow-sm dark:bg-zinc-900 {pending
		? 'border-sky-200 dark:border-sky-900'
		: 'border-zinc-200 dark:border-zinc-800'}"
>
	<div class="mb-3 flex items-center gap-1">
		<h3 data-testid="inline-input-title" class="min-w-0 flex-1 truncate font-semibold">
			{a.title}
		</h3>
		{#if !pending && mode === 'view'}
			<span
				data-testid="inline-input-answered"
				class="mr-1 text-xs text-emerald-700 dark:text-emerald-400">✓ Answered</span
			>
		{/if}
		{#if a.status === 'stale' || a.status === 'updating'}<StatusBadge status={a.status} />{/if}
		{#if mode === 'view'}
			{#if !pending}
				<button
					data-testid="inline-input-edit-answers"
					class={link}
					disabled={busy}
					onclick={() => (mode = 'answers')}
				>
					{a.kind === 'widget' ? 'Change' : 'Edit answers'}
				</button>
			{/if}
			{#if form}
				<button
					data-testid="inline-input-edit-questions"
					class={link}
					disabled={busy}
					onclick={() => ((error = ''), (mode = 'questions'))}
				>
					Edit questions
				</button>
			{/if}
			<button data-testid="inline-input-open" class={link} onclick={onopen}>Open</button>
		{/if}
	</div>

	{#key `${v.id}-${mode}`}
		{#if form && mode === 'questions'}
			<QuestionEditor
				spec={form}
				saveLabel={pending ? 'Save questions' : 'Save and tell the agent'}
				disabled={busy}
				onsave={saveSpec}
				oncancel={() => (mode = 'view')}
			/>
		{:else if form}
			<FormView
				spec={form}
				values={v.data}
				submitLabel={pending ? (form.submitLabel ?? 'Submit') : 'Save and tell the agent'}
				disabled={busy || (!pending && mode !== 'answers')}
				onsubmit={submit}
				oncancel={pending ? undefined : () => (mode = 'view')}
			/>
		{:else if widget}
			<Widget
				spec={widget}
				title={a.title}
				initial={v.data}
				live={!busy && (pending || mode === 'answers')}
				onsubmit={submit}
			/>
			{#if mode === 'answers'}
				<button
					data-testid="inline-input-cancel"
					class="mt-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
					onclick={() => (mode = 'view')}
				>
					Cancel
				</button>
			{/if}
		{/if}
	{/key}
	{#if error}<p data-testid="inline-input-error" class="mt-2 text-sm text-rose-600">{error}</p>{/if}
</div>
