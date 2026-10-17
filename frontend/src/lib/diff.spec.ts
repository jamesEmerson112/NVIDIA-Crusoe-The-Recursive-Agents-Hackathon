import { describe, expect, it } from 'vitest';
import { lineDiff, withContext } from './diff';

describe('lineDiff', () => {
	it('marks replaced lines as a deletion then an addition', () => {
		expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual([
			{ type: 'same', text: 'a' },
			{ type: 'del', text: 'b' },
			{ type: 'add', text: 'B' },
			{ type: 'same', text: 'c' }
		]);
	});

	it('handles pure insertions and deletions at the ends', () => {
		expect(lineDiff('a', 'a\nb').map((l) => l.type)).toEqual(['same', 'add']);
		expect(lineDiff('x\na', 'a').map((l) => l.type)).toEqual(['del', 'same']);
	});
});

describe('withContext', () => {
	it('collapses long unchanged runs into one gap', () => {
		const lines = lineDiff('1\n2\n3\n4\n5\n6\n7', '1\n2\n3\n4\n5\n6\nX');
		expect(withContext(lines, 1)).toEqual([
			null,
			{ type: 'same', text: '6' },
			{ type: 'del', text: '7' },
			{ type: 'add', text: 'X' }
		]);
	});
});
