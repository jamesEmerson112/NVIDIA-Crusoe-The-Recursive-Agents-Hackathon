import { describe, expect, it } from 'vitest';
import { checkData, checkSubmission, diffData, normalizeWidget } from './widgets';

describe('checkData', () => {
	const schema = {
		type: 'object' as const,
		required: ['guests', 'seating'],
		properties: {
			guests: { type: 'integer' as const, minimum: 1, maximum: 20 },
			seating: { type: 'string' as const, enum: ['indoor', 'outdoor'] },
			dishes: { type: 'array' as const, items: { type: 'string' as const } }
		}
	};

	it('accepts matching data', () => {
		expect(checkData({ guests: 8, seating: 'indoor', dishes: ['bulgogi'] }, schema)).toEqual([]);
	});

	it('reports every problem with a path', () => {
		expect(checkData({ guests: 30, dishes: [1] }, schema)).toEqual([
			'data.seating is missing',
			'data.guests should be ≤ 20',
			'data.dishes[0] should be a string, got number'
		]);
		expect(checkData({ guests: 2.5, seating: 'roof' }, schema)).toEqual([
			'data.guests should be an integer',
			'data.seating should be one of ["indoor","outdoor"]'
		]);
	});
});

describe('normalizeWidget', () => {
	it('requires html that calls $submit', () => {
		expect(() => normalizeWidget({ html: '<div>hi</div>' })).toThrow(/\$submit/);
		expect(
			normalizeWidget({ html: ' <button @click="$submit({ok:true})">Go</button> ' }).html
		).toBe('<button @click="$submit({ok:true})">Go</button>');
	});

	it('rejects external resources', () => {
		expect(() =>
			normalizeWidget({ html: '<script src="https://x.y/a.js"></script>$submit' })
		).toThrow(/external/);
	});
});

describe('checkSubmission', () => {
	it('requires a plain object', () => {
		expect(checkSubmission({ html: '' }, [1])).toEqual(['submitted data must be an object']);
		expect(checkSubmission({ html: '' }, { a: 1 })).toEqual([]);
	});
});

describe('diffData', () => {
	it('reports leaf paths', () => {
		const before = {
			people: [
				{ name: 'Person 1', amount: 60 },
				{ name: 'B', amount: 60 }
			],
			note: 'x'
		};
		const after = {
			people: [
				{ name: 'Alex', amount: 60 },
				{ name: 'B', amount: 70 },
				{ name: 'C', amount: 0 }
			]
		};
		expect(diffData(before, after)).toEqual([
			'- people[0].name: "Person 1" → "Alex"',
			'- people[1].amount: 60 → 70',
			'- people[2]: (none) → {"name":"C","amount":0}',
			'- note: "x" → (none)'
		]);
	});

	it('caps long diffs', () => {
		const a = { xs: [...Array(50).keys()] };
		const b = { xs: [...Array(50).keys()].map((n) => n + 1) };
		expect(diffData(a, b, 3)).toHaveLength(4);
	});
});
