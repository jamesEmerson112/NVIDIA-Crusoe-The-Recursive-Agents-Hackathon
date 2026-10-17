import { describe, expect, it } from 'vitest';
import { diffSpecs, fieldName, normalizeFormSpec } from './forms';

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

describe('fieldName', () => {
	it('slugs the label and avoids taken names', () => {
		expect(fieldName('Parking needed?', [])).toBe('parking_needed');
		expect(fieldName('Budget', ['budget', 'budget_2'])).toBe('budget_3');
		expect(fieldName('???', [])).toBe('question');
	});
});

describe('diffSpecs', () => {
	const base = {
		fields: [
			{ name: 'time', label: 'Time', type: 'text' as const },
			{ name: 'vibe', label: 'Vibe', type: 'radio' as const, options: ['Quiet', 'Lively'] }
		]
	};

	it('reports added, removed, reworded and option changes', () => {
		const after = {
			fields: [
				{ name: 'time', label: 'Dinner time', type: 'text' as const },
				{ name: 'parking', label: 'Parking?', type: 'checkbox' as const }
			]
		};
		expect(diffSpecs(base, after)).toEqual([
			'- reworded "Time" → "Dinner time" (time)',
			'- added question "Parking?" (parking, checkbox)',
			'- removed question "Vibe" (vibe)'
		]);
		const opts = {
			fields: [base.fields[0], { ...base.fields[1], options: ['Quiet', 'Lively', 'Outdoor'] }]
		};
		expect(diffSpecs(base, opts)).toEqual([
			'- "Vibe" options ["Quiet","Lively"] → ["Quiet","Lively","Outdoor"]'
		]);
	});

	it('is empty when nothing changed and notices reordering', () => {
		expect(diffSpecs(base, base)).toEqual([]);
		expect(diffSpecs(base, { fields: [base.fields[1], base.fields[0]] })).toEqual([
			'- questions reordered'
		]);
	});
});
