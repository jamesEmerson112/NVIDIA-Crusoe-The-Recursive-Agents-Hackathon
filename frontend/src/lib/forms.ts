import type { FieldType, FormField, FormSpec } from '#lib/types.ts';

/** Answers are stored as text; older forms may hold booleans or lists. */
export function answerText(v: unknown): string {
	if (v === undefined || v === null) return '';
	if (Array.isArray(v)) return v.map(String).join(', ');
	if (v === true) return 'Yes';
	if (v === false) return 'No';
	return String(v);
}

const humanize = (name: string) => {
	const words = name
		.replace(/[_-]+/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.trim();
	return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

/**
 * Models don't always follow the tool schema (GLM-5.3-Flash omitted a required `label`), so
 * repair form specs before storing them: every field ends up renderable and uniquely named.
 */
export function normalizeFormSpec(input: {
	description?: unknown;
	fields?: unknown;
	submitLabel?: unknown;
}): FormSpec {
	const seen = new Set<string>();
	const fields: FormField[] = [];
	for (const raw of Array.isArray(input.fields) ? input.fields : []) {
		if (!raw || typeof raw !== 'object') continue;
		const f = raw as Record<string, unknown>;
		const name = typeof f.name === 'string' ? f.name.trim() : '';
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// Everything is free text now. Choice types keep their options as suggestion chips;
		// yes/no becomes Yes / No suggestions.
		const legacy = typeof f.type === 'string' ? f.type : 'text';
		const type: FieldType = legacy === 'textarea' ? 'textarea' : 'text';
		let options = Array.isArray(f.options)
			? [
					...new Set(
						f.options
							.filter((o) => typeof o === 'string' || typeof o === 'number')
							.map(String)
							.map((o) => o.trim())
							.filter(Boolean)
					)
				]
			: [];
		if (legacy === 'checkbox' && !options.length) options = ['Yes', 'No'];

		fields.push({
			name,
			label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : humanize(name),
			type,
			...(options.length ? { options } : {}),
			...(typeof f.placeholder === 'string' ? { placeholder: f.placeholder } : {}),
			...(typeof f.help === 'string' ? { help: f.help } : {}),
			...(f.default !== undefined && f.default !== null ? { default: answerText(f.default) } : {})
		});
	}
	return {
		...(typeof input.description === 'string' ? { description: input.description } : {}),
		fields,
		...(typeof input.submitLabel === 'string' && input.submitLabel.trim()
			? { submitLabel: input.submitLabel }
			: {})
	};
}

/** A field name for a new question: snake_case from its label, unique within `taken`. */
export function fieldName(label: string, taken: Iterable<string>) {
	const used = new Set(taken);
	const base =
		label
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 40) || 'question';
	let name = base;
	for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
	return name;
}

const show = (v: unknown) => JSON.stringify(v);

/** Human-readable list of what changed between two versions of a form's questions. */
export function diffSpecs(before: FormSpec, after: FormSpec): string[] {
	const out: string[] = [];
	const old = new Map(before.fields.map((f) => [f.name, f]));
	const now = new Map(after.fields.map((f) => [f.name, f]));
	for (const f of after.fields) {
		const o = old.get(f.name);
		if (!o) {
			out.push(
				`- added question "${f.label}" (${f.name}, ${f.type}${f.options ? `: ${f.options.join(' / ')}` : ''})`
			);
			continue;
		}
		if (o.label !== f.label) out.push(`- reworded "${o.label}" → "${f.label}" (${f.name})`);
		if (o.type !== f.type) out.push(`- "${f.label}" type ${o.type} → ${f.type}`);
		if (show(o.options ?? []) !== show(f.options ?? []))
			out.push(`- "${f.label}" options ${show(o.options ?? [])} → ${show(f.options ?? [])}`);
		if ((o.help ?? '') !== (f.help ?? '')) out.push(`- "${f.label}" help text changed`);
	}
	for (const o of before.fields)
		if (!now.has(o.name)) out.push(`- removed question "${o.label}" (${o.name})`);
	const order = (s: FormSpec) =>
		s.fields.map((f) => f.name).filter((n) => old.has(n) && now.has(n));
	if (show(order(before)) !== show(order(after))) out.push('- questions reordered');
	if ((before.description ?? '') !== (after.description ?? ''))
		out.push('- form description changed');
	return out;
}
