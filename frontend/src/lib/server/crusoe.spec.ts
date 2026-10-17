import { describe, expect, it } from 'vitest';
import { costOf } from './crusoe';

describe('costOf', () => {
	it('bills cached prompt tokens at the cached rate', () => {
		// gpt-oss-120b: $0.05 input, $0.05 cached, $0.25 output per 1M tokens
		expect(costOf('openai/gpt-oss-120b', 1_000_000, 1_000_000, 0)).toBeCloseTo(0.3);
		// V4 Flash: 600k uncached at $0.14 + 400k cached at $0.03 + 0 output
		expect(costOf('deepseek-ai/Deepseek-V4-Flash', 1_000_000, 0, 400_000)).toBeCloseTo(
			0.084 + 0.012
		);
	});

	it('returns 0 for models without a known price', () => {
		expect(costOf('unknown/model', 1000, 1000, 0)).toBe(0);
	});
});
