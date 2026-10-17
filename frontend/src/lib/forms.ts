import type { FieldType, FormField, FormSpec } from '#lib/types.ts';

const TYPES: FieldType[] = [
	'text',
	'textarea',
	'number',
	'email',
	'date',
	'select',
	'radio',
	'checkbox',
	'checkboxes'
];
const CHOICE: FieldType[] = ['select', 'radio', 'checkboxes'];

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

		let type: FieldType = TYPES.includes(f.type as FieldType) ? (f.type as FieldType) : 'text';
		const options = Array.isArray(f.options)
			? f.options
					.filter((o): o is string | number => typeof o === 'string' || typeof o === 'number')
					.map(String)
			: undefined;
		if (CHOICE.includes(type) && !options?.length)
			type = type === 'checkboxes' ? 'textarea' : 'text';

		fields.push({
			name,
			label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : humanize(name),
			type,
			...(CHOICE.includes(type) ? { options } : {}),
			...(f.required === true ? { required: true } : {}),
			...(typeof f.placeholder === 'string' ? { placeholder: f.placeholder } : {}),
			...(typeof f.help === 'string' ? { help: f.help } : {}),
			...(f.default !== undefined ? { default: f.default } : {})
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
