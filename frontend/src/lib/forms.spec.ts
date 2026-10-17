import { describe, expect, it } from 'vitest';
import { answerText, diffSpecs, fieldName, normalizeFormSpec } from './forms';

describe('normalizeFormSpec', () => {
	it('derives a missing label from the field name', () => {
		const spec = normalizeFormSpec({ fields: [{ name: 'location_preference', type: 'text' }] });
		expect(spec.fields[0].label).toBe('Location preference');
	});

	it('turns every legacy type into free text, keeping choices as suggestions', () => {
		const spec = normalizeFormSpec({
			fields: [
				{ name: 'a', label: 'A', type: 'slider' },
				{ name: 'b', label: 'B', type: 'select', options: ['x', 2, null] },
				{ name: 'c', label: 'C', type: 'checkboxes', options: ['p', 'q'] },
				{ name: 'd', label: 'D', type: 'checkbox' },
				{ name: 'e', label: 'E', type: 'textarea' },
				{ name: 'f', label: 'F', type: 'date', default: false }
			]
		});
		expect(spec.fields.map((f) => [f.type, f.options])).toEqual([
			['text', undefined],
			['text', ['x', '2']],
			['text', ['p', 'q']],
			['text', ['Yes', 'No']],
			['textarea', undefined],
			['text', undefined]
		]);
		expect(spec.fields[5].default).toBe('No');
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
			{ name: 'vibe', label: 'Vibe', type: 'text' as const, options: ['Quiet', 'Lively'] }
		]
	};

	it('reports added, removed, reworded and option changes', () => {
		const after = {
			fields: [
				{ name: 'time', label: 'Dinner time', type: 'text' as const },
				{ name: 'parking', label: 'Parking?', type: 'textarea' as const }
			]
		};
		expect(diffSpecs(base, after)).toEqual([
			'- reworded "Time" → "Dinner time" (time)',
			'- added question "Parking?" (parking, textarea)',
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

describe('answerText', () => {
	it('renders legacy answers as text', () => {
		expect([
			answerText(['a', 'b']),
			answerText(true),
			answerText(false),
			answerText(null),
			answerText(3)
		]).toEqual(['a, b', 'Yes', 'No', '', '3']);
	});
});
