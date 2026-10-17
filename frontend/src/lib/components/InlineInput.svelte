<script lang="ts">
	import { saveQuestions, type RunBody } from '#lib/client/run.svelte.ts';
	import type { ConversationState } from '#lib/server/store.ts';
	import type { FormSpec, WidgetSpec } from '#lib/types.ts';
	import FormView from './FormView.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import Widget from './Widget.svelte';

	type Artifact = ConversationState['artifacts'][number];

	let {
		artifact: a,
		cid,
		busy,
		run
	}: {
		/** A form or widget, embedded in the chat where the agent asked for it. */
		artifact: Artifact;
		cid: string;
		busy: boolean;
		run: (body: RunBody) => void;
	} = $props();

	/** 'edit' makes an answered form's questions and answers editable together. */
	let mode = $state<'view' | 'edit'>('view');
	let error = $state('');

	const v = $derived(a.versions.find((x) => x.version === a.currentVersion) ?? a.versions[0]);
	const pending = $derived(a.status === 'awaiting_input');
	const form = $derived(a.kind === 'form' ? (JSON.parse(v.content) as FormSpec) : null);
	const widget = $derived(a.kind === 'widget' ? (JSON.parse(v.content) as WidgetSpec) : null);

	// Question edits on an unanswered form save as they happen (no agent run). Submitting waits
	// for any save still in flight so the agent sees the final questions.
	let saving: Promise<unknown> = Promise.resolve();
	function saveSpec(spec: FormSpec) {
		error = '';
		saving = saveQuestions(cid, a.id, spec, { refresh: false }).catch((err) => {
			error = (err as Error).message;
		});
	}

	async function submit(values: Record<string, unknown>, spec?: FormSpec) {
		if (pending) {
			await saving;
			run({ type: 'form_submit', artifactId: a.id, values });
		} else if (spec) {
			mode = 'view';
			run({ type: 'artifact_edit', artifactId: a.id, values, spec });
		} else {
			// Answers only: on an answered artifact the server turns this into an edit.
			mode = 'view';
			run({ type: 'form_submit', artifactId: a.id, values });
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
					data-testid="inline-input-edit"
					class={link}
					disabled={busy}
					onclick={() => (mode = 'edit')}
				>
					{a.kind === 'widget' ? 'Change' : 'Edit'}
				</button>
			{/if}
		{/if}
	</div>

	{#key `${v.id}-${mode}`}
		{#if form}
			<FormView
				spec={form}
				values={v.data}
				editQuestions={pending || mode === 'edit'}
				submitLabel={pending ? (form.submitLabel ?? 'Submit') : 'Save and tell the agent'}
				disabled={busy || (!pending && mode !== 'edit')}
				onspec={pending ? saveSpec : undefined}
				onsubmit={submit}
				oncancel={pending ? undefined : () => (mode = 'view')}
			/>
		{:else if widget}
			<Widget
				spec={widget}
				title={a.title}
				initial={v.data}
				live={!busy && (pending || mode === 'edit')}
				onsubmit={(values) => submit(values)}
			/>
			{#if mode === 'edit'}
				<button
					data-testid="inline-input-cancel"
					class="mt-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
					onclick={() => (mode = 'view')}>Cancel</button
				>
			{/if}
		{/if}
	{/key}
	{#if error}<p data-testid="inline-input-error" class="mt-2 text-sm text-rose-600">{error}</p>{/if}
</div>
