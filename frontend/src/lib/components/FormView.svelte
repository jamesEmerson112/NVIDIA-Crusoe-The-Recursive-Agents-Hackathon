<script lang="ts">
	import type { FormField, FormSpec } from '#lib/types.ts';

	let {
		spec,
		values: initial,
		submitLabel,
		disabled = false,
		onsubmit,
		oncancel
	}: {
		spec: FormSpec;
		values?: Record<string, unknown> | null;
		submitLabel: string;
		disabled?: boolean;
		onsubmit: (values: Record<string, unknown>) => void;
		oncancel?: () => void;
	} = $props();

	const start = (f: FormField) =>
		initial?.[f.name] ??
		f.default ??
		(f.type === 'checkbox' ? false : f.type === 'checkboxes' ? [] : '');
	// Seeded once from props; the parent remounts the form ({#key}) to load another version.
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, any>>(
		Object.fromEntries(spec.fields.map((f) => [f.name, start(f)]))
	);

	function toggle(name: string, option: string, on: boolean) {
		const list: string[] = values[name] ?? [];
		values[name] = on ? [...list, option] : list.filter((o) => o !== option);
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const out: Record<string, unknown> = {};
		for (const f of spec.fields) {
			const v = values[f.name];
			out[f.name] = f.type === 'number' && v !== '' && v !== null ? Number(v) : v;
		}
		onsubmit(out);
	}

	const input =
		'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900';
</script>

<form class="space-y-4" onsubmit={submit}>
	{#if spec.description}
		<p class="text-sm text-zinc-600 dark:text-zinc-400">{spec.description}</p>
	{/if}
	<fieldset class="space-y-4" {disabled}>
		{#each spec.fields as f (f.name)}
			<div class="space-y-1.5">
				{#if f.type === 'checkbox'}
					<label class="flex items-center gap-2 text-sm font-medium">
						<input
							type="checkbox"
							class="size-4 accent-emerald-600"
							bind:checked={values[f.name]}
						/>
						{f.label}
					</label>
				{:else}
					<label class="block text-sm font-medium" for="f-{f.name}">
						{f.label}{#if f.required}<span class="text-rose-600"> *</span>{/if}
					</label>
					{#if f.type === 'textarea'}
						<textarea
							id="f-{f.name}"
							class={input}
							rows="3"
							required={f.required}
							placeholder={f.placeholder}
							bind:value={values[f.name]}></textarea>
					{:else if f.type === 'select'}
						<select id="f-{f.name}" class={input} required={f.required} bind:value={values[f.name]}>
							<option value="" disabled>Choose…</option>
							{#each f.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
						</select>
					{:else if f.type === 'radio'}
						<div class="flex flex-wrap gap-2" id="f-{f.name}">
							{#each f.options ?? [] as o (o)}
								<label
									class="cursor-pointer rounded-full border border-zinc-300 px-3 py-1 text-sm has-checked:border-emerald-600 has-checked:bg-emerald-600/10 has-checked:text-emerald-800 dark:border-zinc-700 dark:has-checked:text-emerald-300"
								>
									<input
										type="radio"
										class="sr-only"
										name={f.name}
										value={o}
										required={f.required}
										bind:group={values[f.name]}
									/>
									{o}
								</label>
							{/each}
						</div>
					{:else if f.type === 'checkboxes'}
						<div class="flex flex-wrap gap-2" id="f-{f.name}">
							{#each f.options ?? [] as o (o)}
								<label
									class="cursor-pointer rounded-full border border-zinc-300 px-3 py-1 text-sm has-checked:border-emerald-600 has-checked:bg-emerald-600/10 dark:border-zinc-700"
								>
									<input
										type="checkbox"
										class="sr-only"
										checked={(values[f.name] ?? []).includes(o)}
										onchange={(e) => toggle(f.name, o, e.currentTarget.checked)}
									/>
									{o}
								</label>
							{/each}
						</div>
					{:else}
						<input
							id="f-{f.name}"
							class={input}
							type={f.type}
							required={f.required}
							placeholder={f.placeholder}
							bind:value={values[f.name]}
						/>
					{/if}
				{/if}
				{#if f.help}<p class="text-xs text-zinc-500">{f.help}</p>{/if}
			</div>
		{/each}
	</fieldset>
	{#if !disabled}
		<div class="flex gap-2">
			<button
				class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
				>{submitLabel}</button
			>
			{#if oncancel}
				<button
					type="button"
					class="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
					onclick={oncancel}>Cancel</button
				>
			{/if}
		</div>
	{/if}
</form>
