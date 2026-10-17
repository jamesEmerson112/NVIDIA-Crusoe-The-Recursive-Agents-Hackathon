import { describe, expect, it } from 'vitest';
import { normalizeFormSpec } from './forms';

describe('normalizeFormSpec', () => {
	it('derives a missing label from the field name', () => {
		const spec = normalizeFormSpec({ fields: [{ name: 'location_preference', type: 'text' }] });
		expect(spec.fields[0].label).toBe('Location preference');
	});

	it('repairs unknown types and choice fields without options', () => {
		const spec = normalizeFormSpec({
			fields: [
				{ name: 'a', label: 'A', type: 'slider' },
				{ name: 'b', label: 'B', type: 'select' },
				{ name: 'c', label: 'C', type: 'checkboxes', options: [] },
				{ name: 'd', label: 'D', type: 'radio', options: ['x', 2, null] }
			]
		});
		expect(spec.fields.map((f) => f.type)).toEqual(['text', 'text', 'textarea', 'radio']);
		expect(spec.fields[3].options).toEqual(['x', '2']);
	});

	it('drops unnamed and duplicate fields', () => {
		const spec = normalizeFormSpec({
			fields: [
				{ label: 'No name', type: 'text' },
				{ name: 'x', type: 'text' },
				{ name: 'x', type: 'number' },
				'junk'
			]
		});
		expect(spec.fields).toHaveLength(1);
		expect(spec.fields[0].type).toBe('text');
	});
});
