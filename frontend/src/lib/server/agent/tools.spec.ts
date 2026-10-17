import { describe, expect, it } from 'vitest';
import { coerceArgs } from './tools';

describe('coerceArgs', () => {
	it('decodes arrays and objects sent as JSON strings', () => {
		expect(coerceArgs({ steps: '[{"title":"A"}]', meta: '{"a":1}', title: 'Plan' })).toEqual({
			steps: [{ title: 'A' }],
			meta: { a: 1 },
			title: 'Plan'
		});
	});

	it('keeps strings that only look like JSON', () => {
		expect(coerceArgs({ content: '[draft] notes' })).toEqual({ content: '[draft] notes' });
	});

	it('returns an empty object for non-object arguments', () => {
		expect(coerceArgs([1, 2])).toEqual({});
		expect(coerceArgs(null)).toEqual({});
	});
});
