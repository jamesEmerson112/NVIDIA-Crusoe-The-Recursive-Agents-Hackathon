import type { DataSchema, WidgetSpec } from '#lib/types.ts';

/** Largest widget HTML and submitted data we accept, in characters of JSON. */
export const MAX_WIDGET_HTML = 40_000;
export const MAX_WIDGET_DATA = 20_000;

/** Check `data` against a small JSON Schema subset. Returns human-readable problems, empty if valid. */
export function checkData(data: unknown, schema: DataSchema | undefined, path = 'data'): string[] {
	if (!schema) return [];
	const problems: string[] = [];
	const kind = Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data;
	switch (schema.type) {
		case 'object':
			if (kind !== 'object') return [`${path} should be an object, got ${kind}`];
			break;
		case 'array':
			if (kind !== 'array') return [`${path} should be an array, got ${kind}`];
			break;
		case 'integer':
			if (!Number.isInteger(data)) return [`${path} should be an integer`];
			break;
		case 'number':
			if (kind !== 'number' || !Number.isFinite(data)) return [`${path} should be a number`];
			break;
		case 'string':
		case 'boolean':
			if (kind !== schema.type) return [`${path} should be a ${schema.type}, got ${kind}`];
			break;
	}
	if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data))) {
		problems.push(`${path} should be one of ${JSON.stringify(schema.enum)}`);
	}
	if (typeof data === 'number') {
		if (schema.minimum !== undefined && data < schema.minimum)
			problems.push(`${path} should be ≥ ${schema.minimum}`);
		if (schema.maximum !== undefined && data > schema.maximum)
			problems.push(`${path} should be ≤ ${schema.maximum}`);
	}
	if (kind === 'object' && data) {
		const obj = data as Record<string, unknown>;
		for (const key of schema.required ?? []) {
			if (obj[key] === undefined) problems.push(`${path}.${key} is missing`);
		}
		for (const [key, sub] of Object.entries(schema.properties ?? {})) {
			if (obj[key] !== undefined) problems.push(...checkData(obj[key], sub, `${path}.${key}`));
		}
	}
	if (Array.isArray(data) && schema.items) {
		data.forEach((item, i) => problems.push(...checkData(item, schema.items, `${path}[${i}]`)));
	}
	return problems;
}

/** Validate what the agent sent to create_widget. Throws with a message the agent can act on. */
export function normalizeWidget(input: {
	html?: unknown;
	description?: unknown;
	schema?: unknown;
}): WidgetSpec {
	const html = typeof input.html === 'string' ? input.html.trim() : '';
	if (!html) throw new Error('html is required');
	if (html.length > MAX_WIDGET_HTML)
		throw new Error(`html is ${html.length} characters; keep it under ${MAX_WIDGET_HTML}`);
	if (!html.includes('$submit')) {
		throw new Error(
			'the widget never calls $submit(data), so the user could not send anything back'
		);
	}
	if (/<script[^>]*\bsrc\s*=/i.test(html) || /<link[^>]*\bhref\s*=\s*["']?https?:/i.test(html)) {
		throw new Error('external scripts and stylesheets are blocked (no network); inline everything');
	}
	const schema =
		input.schema && typeof input.schema === 'object' && !Array.isArray(input.schema)
			? (input.schema as DataSchema)
			: undefined;
	return {
		html,
		...(typeof input.description === 'string' && input.description.trim()
			? { description: input.description.trim() }
			: {}),
		...(schema ? { schema } : {})
	};
}

/** Check a submission: plain JSON object, size-capped, matching the widget's schema if it has one. */
export function checkSubmission(spec: WidgetSpec, data: unknown): string[] {
	if (!data || typeof data !== 'object' || Array.isArray(data))
		return ['submitted data must be an object'];
	const size = JSON.stringify(data).length;
	if (size > MAX_WIDGET_DATA)
		return [`submitted data is ${size} characters; the limit is ${MAX_WIDGET_DATA}`];
	return checkData(data, spec.schema ?? { type: 'object' });
}

/**
 * Leaf-level differences between two JSON values, as `- path: old → new` lines, so the agent sees
 * `people[0].name: "Person 1" → "Alex"` rather than two copies of a large array. Capped at `limit`.
 */
export function diffData(before: unknown, after: unknown, limit = 30): string[] {
	const out: string[] = [];
	const show = (v: unknown) => (v === undefined ? '(none)' : JSON.stringify(v));
	const walk = (a: unknown, b: unknown, path: string) => {
		if (out.length > limit) return;
		if (JSON.stringify(a) === JSON.stringify(b)) return;
		const bothObjects =
			a &&
			b &&
			typeof a === 'object' &&
			typeof b === 'object' &&
			Array.isArray(a) === Array.isArray(b);
		if (!bothObjects) {
			out.push(`- ${path || '(root)'}: ${show(a)} → ${show(b)}`);
			return;
		}
		const keys = Array.isArray(a)
			? [...Array(Math.max(a.length, (b as unknown[]).length)).keys()]
			: [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])];
		for (const k of keys) {
			const child = Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : String(k);
			walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], child);
		}
	};
	walk(before, after, '');
	return out.length > limit
		? [...out.slice(0, limit), `- …and more; see the submitted data below`]
		: out;
}
