<script lang="ts">
	import { tick } from 'svelte';
	import { answerText, fieldName, normalizeFormSpec } from '#lib/forms.ts';
	import type { FormField, FormSpec } from '#lib/types.ts';

	let {
		spec: rawSpec,
		values: initial,
		submitLabel,
		disabled = false,
		editQuestions = false,
		saveWhenChanged = false,
		onsubmit,
		onspec,
		oncancel
	}: {
		spec: FormSpec;
		values?: Record<string, unknown> | null;
		submitLabel: string;
		/** Answers are read-only and the submit button is hidden. */
		disabled?: boolean;
		/**
		 * Question text and help are edited in place; they read as plain text until clicked.
		 * Clearing a question's text removes it.
		 */
		editQuestions?: boolean;
		/**
		 * For an answered form that stays editable: the save button (and Discard) only appear once
		 * something actually changed.
		 */
		saveWhenChanged?: boolean;
		/** Answers (all text), plus the new questions if they were edited. */
		onsubmit: (values: Record<string, string>, spec?: FormSpec) => void;
		/** A question edit was committed (on blur). */
		onspec?: (spec: FormSpec) => void;
		oncancel?: () => void;
	} = $props();

	type Row = {
		key: number;
		/** null for questions added here; named from the label when the spec is built. */
		name: string | null;
		label: string;
		long: boolean;
		options: string[];
		help: string;
		placeholder?: string;
		default?: unknown;
	};

	// Older forms used select/radio/date/…; normalizing turns them into text with suggestions.
	// Seeded once from props; the parent remounts the form ({#key}) to load another version.
	// svelte-ignore state_referenced_locally
	const spec = normalizeFormSpec(rawSpec);
	let nextKey = 0;
	let rows = $state<Row[]>(
		spec.fields.map((f) => ({
			key: nextKey++,
			name: f.name,
			label: f.label,
			long: f.type === 'textarea',
			options: f.options ?? [],
			help: f.help ?? '',
			placeholder: f.placeholder,
			default: f.default
		}))
	);
	let description = $state(spec.description ?? '');
	const slot = (r: Row) => r.name ?? `__new_${r.key}`;
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, string>>(
		Object.fromEntries(rows.map((r) => [slot(r), answerText(initial?.[r.name!] ?? r.default)]))
	);

	// Removed questions keep their names reserved so a new question never inherits an old answer.
	const reserved = spec.fields.map((f) => f.name);

	function names() {
		const taken = [...reserved];
		return rows.map((r) => {
			if (r.name) return r.name;
			const n = fieldName(r.label, taken);
			taken.push(n);
			return n;
		});
	}

	function buildSpec(): FormSpec {
		const n = names();
		const fields: FormField[] = rows.map((r, i) => {
			const options = [...new Set(r.options.map((o) => o.trim()).filter(Boolean))];
			return {
				...(r.placeholder ? { placeholder: r.placeholder } : {}),
				...(r.default !== undefined ? { default: r.default } : {}),
				name: n[i],
				label: r.label.trim(),
				type: r.long ? 'textarea' : 'text',
				...(options.length ? { options } : {}),
				...(r.help.trim() ? { help: r.help.trim() } : {})
			};
		});
		return {
			...(description.trim() ? { description: description.trim() } : {}),
			fields,
			...(spec.submitLabel ? { submitLabel: spec.submitLabel } : {})
		};
	}

	const valid = $derived(rows.length > 0 && rows.every((r) => r.label.trim()));
	let committed = JSON.stringify(buildSpec());
	const changed = () => JSON.stringify(buildSpec()) !== committed;
	const initialSpec = committed;
	const initialValues = JSON.stringify(values);
	const dirty = $derived(
		JSON.stringify(buildSpec()) !== initialSpec || JSON.stringify(values) !== initialValues
	);

	/** Hand finished question edits to the parent (unanswered forms save them right away). */
	function commit() {
		if (!onspec || !valid || !changed()) return;
		const next = buildSpec();
		committed = JSON.stringify(next);
		onspec(next);
	}

	/** Clearing a question's text removes it (unless it is the last one). */
	function leaveQuestion(r: Row) {
		if (!r.label.trim() && rows.length > 1) {
			rows = rows.filter((x) => x !== r);
			delete values[slot(r)];
		}
		commit();
	}

	let list: HTMLElement | undefined = $state();
	async function add() {
		const r: Row = {
			key: nextKey++,
			name: null,
			label: '',
			long: false,
			options: [],
			help: ''
		};
		rows.push(r);
		values[slot(r)] = '';
		await tick();
		const inputs = list?.querySelectorAll<HTMLInputElement>('[data-testid="form-question-text"]');
		inputs?.[inputs.length - 1]?.focus();
	}

	const parts = (v: string) =>
		v
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
	const picked = (r: Row, o: string) => parts(values[slot(r)] ?? '').includes(o);

	/**
	 * Suggestion chips toggle in a comma-separated answer, on every field: several can be picked,
	 * clicking a picked chip removes it, and anything typed around them is kept. (Models rarely
	 * set a multi-pick flag reliably, so this doesn't depend on one.)
	 */
	function pick(r: Row, o: string) {
		const key = slot(r);
		const current = parts(values[key] ?? '');
		values[key] = (current.includes(o) ? current.filter((p) => p !== o) : [...current, o]).join(
			', '
		);
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (editQuestions && !valid) return;
		const n = names();
		const out: Record<string, string> = {};
		rows.forEach((r, i) => (out[n[i]] = (values[slot(r)] ?? '').trim()));
		onsubmit(out, editQuestions && changed() ? buildSpec() : undefined);
	}

	const blurOnEnter = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			(e.currentTarget as HTMLElement).blur();
		}
	};

	const input =
		'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900';
	// Editable text that reads as plain text until focused. Border and padding never change and
	// -mx-2 cancels the padding, so the text sits exactly where static text would.
	// Textareas that grow with their text (field-sizing) so long questions wrap instead of clipping.
	const plain =
		'-mx-2 block w-[calc(100%+1rem)] cursor-text resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-0.5 outline-none field-sizing-content focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-emerald-600/20 dark:focus:border-zinc-700 dark:focus:bg-zinc-900';
</script>

<form data-testid="form" class="space-y-4" onsubmit={submit}>
	{#if editQuestions}
		<textarea
			data-testid="form-description-text"
			rows="1"
			class="{plain} text-sm text-zinc-600 placeholder:text-transparent hover:placeholder:text-zinc-400 focus:placeholder:text-zinc-400 dark:text-zinc-400"
			bind:value={description}
			placeholder="Add a description"
			aria-label="Form description"
			onblur={commit}
			onkeydown={blurOnEnter}></textarea>
	{:else if description}
		<p data-testid="form-description" class="text-sm text-zinc-600 dark:text-zinc-400">
			{description}
		</p>
	{/if}

	<div class="space-y-4" bind:this={list}>
		{#each rows as r, i (r.key)}
			<div data-testid="form-field" class="space-y-1.5">
				{#if editQuestions}
					<textarea
						data-testid="form-question-text"
						rows="1"
						class="{plain} text-sm font-medium"
						bind:value={r.label}
						placeholder="Question"
						aria-label="Question"
						onblur={() => leaveQuestion(r)}
						onkeydown={blurOnEnter}></textarea>
				{:else}
					<label data-testid="form-label" class="block text-sm font-medium" for="f-{slot(r)}"
						>{r.label}</label
					>
				{/if}

				{#if r.long}
					<textarea
						id="f-{slot(r)}"
						data-testid="form-input-textarea"
						class={input}
						rows="3"
						{disabled}
						placeholder={r.placeholder}
						aria-label={r.label}
						bind:value={values[slot(r)]}></textarea>
				{:else}
					<input
						id="f-{slot(r)}"
						data-testid="form-input-text"
						class={input}
						type="text"
						{disabled}
						placeholder={r.placeholder}
						aria-label={r.label}
						bind:value={values[slot(r)]}
					/>
				{/if}

				{#if r.options.some((o) => o.trim())}
					<div
						data-testid="form-options"
						class="flex flex-wrap gap-1.5"
						role="group"
						aria-label="Suggestions for {r.label}"
					>
						{#each r.options.filter((o) => o.trim()) as o (o)}
							<button
								data-testid="form-option"
								type="button"
								{disabled}
								aria-pressed={picked(r, o)}
								class="rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-60 {picked(r, o)
									? 'border-emerald-600 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'
									: 'border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'}"
								onclick={() => pick(r, o)}>{o}</button
							>
						{/each}
					</div>
				{/if}

				{#if editQuestions && r.help}
					<textarea
						data-testid="form-help-text"
						rows="1"
						class="{plain} text-xs text-zinc-500"
						bind:value={r.help}
						aria-label="Help text"
						onblur={commit}
						onkeydown={blurOnEnter}></textarea>
				{:else if r.help}
					<p data-testid="form-help" class="text-xs text-zinc-500">{r.help}</p>
				{/if}
			</div>
		{/each}
	</div>

	{#if editQuestions}
		<button
			data-testid="form-add-question"
			type="button"
			class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
			onclick={add}>+ Add question</button
		>
	{/if}

	{#if !disabled && (!saveWhenChanged || dirty)}
		<div class="flex items-center gap-2">
			<button
				data-testid="form-submit"
				class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
				disabled={editQuestions && !valid}>{submitLabel}</button
			>
			{#if oncancel}
				<button
					data-testid="form-cancel"
					type="button"
					class="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
					onclick={oncancel}>{saveWhenChanged ? 'Discard' : 'Cancel'}</button
				>
			{/if}
			{#if editQuestions && !valid}
				<span class="text-xs text-zinc-500">Every question needs text.</span>
			{/if}
		</div>
	{/if}
</form>
