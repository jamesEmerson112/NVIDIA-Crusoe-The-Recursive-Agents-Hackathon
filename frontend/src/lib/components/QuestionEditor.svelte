<script lang="ts">
	import { tick } from 'svelte';
	import { fieldName } from '#lib/forms.ts';
	import type { FieldType, FormField, FormSpec } from '#lib/types.ts';

	let {
		spec,
		saveLabel,
		disabled = false,
		onsave,
		oncancel
	}: {
		spec: FormSpec;
		saveLabel: string;
		disabled?: boolean;
		onsave: (spec: FormSpec) => void;
		oncancel: () => void;
	} = $props();

	type Row = {
		key: number;
		name: string | null;
		label: string;
		type: FieldType;
		options: string;
		help: string;
	};

	let nextKey = 0;
	const toRow = (f: FormField): Row => ({
		key: nextKey++,
		name: f.name,
		label: f.label,
		type: f.type,
		options: (f.options ?? []).join('\n'),
		help: f.help ?? ''
	});
	// Seeded once; the parent remounts the editor to start over.
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(spec.fields.map(toRow));
	// svelte-ignore state_referenced_locally
	let description = $state(spec.description ?? '');

	const TYPES: { value: FieldType; label: string }[] = [
		{ value: 'text', label: 'Short text' },
		{ value: 'textarea', label: 'Long text' },
		{ value: 'number', label: 'Number' },
		{ value: 'date', label: 'Date' },
		{ value: 'email', label: 'Email' },
		{ value: 'select', label: 'Dropdown' },
		{ value: 'radio', label: 'Pick one' },
		{ value: 'checkboxes', label: 'Pick several' },
		{ value: 'checkbox', label: 'Yes / no' }
	];
	const hasOptions = (t: FieldType) => t === 'select' || t === 'radio' || t === 'checkboxes';

	function move(i: number, by: number) {
		const j = i + by;
		if (j < 0 || j >= rows.length) return;
		[rows[i], rows[j]] = [rows[j], rows[i]];
	}

	let list: HTMLOListElement | undefined = $state();

	async function add() {
		rows.push({ key: nextKey++, name: null, label: '', type: 'text', options: '', help: '' });
		await tick();
		const inputs = list?.querySelectorAll<HTMLInputElement>(
			'[data-testid="question-editor-label"]'
		);
		inputs?.[inputs.length - 1]?.focus();
	}

	const valid = $derived(
		rows.length > 0 &&
			rows.every(
				(r) =>
					r.label.trim() && (!hasOptions(r.type) || r.options.split('\n').some((o) => o.trim()))
			)
	);

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		// Existing questions keep their names, so their answers carry over; new ones get a name from the label.
		// Removed questions' names stay reserved so a new question never inherits an old answer.
		const taken = [...spec.fields.map((f) => f.name)];
		const fields: FormField[] = rows.map((r) => {
			const name = r.name ?? fieldName(r.label, taken);
			if (!r.name) taken.push(name);
			const original = spec.fields.find((f) => f.name === r.name);
			return {
				...(original?.placeholder ? { placeholder: original.placeholder } : {}),
				...(original?.default !== undefined && original.type === r.type
					? { default: original.default }
					: {}),
				name,
				label: r.label.trim(),
				type: r.type,
				...(hasOptions(r.type)
					? {
							options: [
								...new Set(
									r.options
										.split('\n')
										.map((o) => o.trim())
										.filter(Boolean)
								)
							]
						}
					: {}),
				...(r.help.trim() ? { help: r.help.trim() } : {})
			};
		});
		onsave({
			...(description.trim() ? { description: description.trim() } : {}),
			fields,
			...(spec.submitLabel ? { submitLabel: spec.submitLabel } : {})
		});
	}

	const box =
		'rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-900';
	const input = `w-full ${box}`;
	// Question text reads as plain text until focused. The border and padding are always there
	// (transparent when idle) so nothing shifts on focus; -mx-2 lines the text up with the header.
	const plainText =
		'-mx-2 block w-[calc(100%+1rem)] cursor-text rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-emerald-600/20 dark:focus:border-zinc-700 dark:focus:bg-zinc-900';
	const small =
		'rounded-md px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';
</script>

<form data-testid="question-editor" class="space-y-4" onsubmit={save}>
	<label class="block space-y-1">
		<span class="text-xs font-medium text-zinc-500">Form description</span>
		<input
			data-testid="question-editor-description"
			class={input}
			bind:value={description}
			placeholder="Optional"
		/>
	</label>

	<ol class="space-y-3" bind:this={list}>
		{#each rows as row, i (row.key)}
			<li
				data-testid="question-editor-question"
				class="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
			>
				<div class="flex items-center gap-1">
					<span class="mr-auto text-xs font-medium text-zinc-500"
						>Question {i + 1}{row.name ? '' : ' · new'}</span
					>
					<button
						data-testid="question-editor-up"
						type="button"
						class={small}
						disabled={i === 0}
						onclick={() => move(i, -1)}
						aria-label="Move up">↑</button
					>
					<button
						data-testid="question-editor-down"
						type="button"
						class={small}
						disabled={i === rows.length - 1}
						onclick={() => move(i, 1)}
						aria-label="Move down">↓</button
					>
					<button
						data-testid="question-editor-remove"
						type="button"
						class="{small} hover:text-rose-600"
						disabled={rows.length === 1}
						onclick={() => rows.splice(i, 1)}>Remove</button
					>
				</div>
				<input
					data-testid="question-editor-label"
					class={plainText}
					bind:value={row.label}
					placeholder="Question"
					aria-label="Question"
				/>
				<div class="flex gap-2">
					<select
						data-testid="question-editor-type"
						class="{box} w-36 shrink-0"
						bind:value={row.type}
						aria-label="Answer type"
					>
						{#each TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
					</select>
					<input
						data-testid="question-editor-help"
						class="{box} min-w-0 flex-1"
						bind:value={row.help}
						placeholder="Help text (optional)"
						aria-label="Help text"
					/>
				</div>
				{#if hasOptions(row.type)}
					<textarea
						data-testid="question-editor-options"
						class="{input} font-mono text-xs"
						rows="3"
						bind:value={row.options}
						placeholder="One option per line"
						aria-label="Options, one per line"></textarea>
				{/if}
			</li>
		{/each}
	</ol>

	<button
		data-testid="question-editor-add"
		type="button"
		class="w-full rounded-xl border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400"
		onclick={add}>+ Add question</button
	>

	<div class="flex items-center gap-2">
		<button
			data-testid="question-editor-save"
			class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
			disabled={disabled || !valid}>{saveLabel}</button
		>
		<button
			data-testid="question-editor-cancel"
			type="button"
			class="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
			onclick={oncancel}>Cancel</button
		>
		{#if !valid}<span class="text-xs text-zinc-500"
				>Every question needs text, and choice questions need options.</span
			>{/if}
	</div>
</form>
