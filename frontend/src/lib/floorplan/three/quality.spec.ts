import { describe, expect, it } from 'vitest';
import { PRESETS, detectQuality, parseQuality } from './quality.ts';

describe('detectQuality', () => {
	it('picks low on an M1 (8 cores, WebGPU)', () => {
		const r = detectQuality({ hardwareConcurrency: 8, webgpu: true });
		expect(r.quality).toBe('low');
		expect(r.reason).toBe('auto: 8 CPU cores');
	});

	it('picks high on an M3 Max (16 cores, WebGPU)', () => {
		const r = detectQuality({ hardwareConcurrency: 16, webgpu: true });
		expect(r.quality).toBe('high');
		expect(r.reason).toBe('auto: 16 CPU cores, WebGPU');
		expect(detectQuality({ hardwareConcurrency: 14, webgpu: true }).quality).toBe('high');
	});

	it('picks low when WebGPU is unavailable, whatever the cores', () => {
		const r = detectQuality({ hardwareConcurrency: 16, webgpu: false });
		expect(r.quality).toBe('low');
		expect(r.reason).toContain('WebGL2');
	});

	it('lets a valid URL override win in both directions', () => {
		const hi = detectQuality({ hardwareConcurrency: 8, webgpu: false, urlOverride: 'high' });
		expect(hi).toEqual({ quality: 'high', reason: 'set by ?quality=high' });
		const lo = detectQuality({ hardwareConcurrency: 16, webgpu: true, urlOverride: 'LOW' });
		expect(lo.quality).toBe('low');
		expect(lo.reason).toBe('set by ?quality=low');
	});

	it('ignores an invalid override', () => {
		expect(
			detectQuality({ hardwareConcurrency: 16, webgpu: true, urlOverride: 'ultra' }).quality
		).toBe('high');
		expect(detectQuality({ hardwareConcurrency: 8, webgpu: true, urlOverride: '' }).quality).toBe(
			'low'
		);
		expect(detectQuality({ hardwareConcurrency: 8, webgpu: true, urlOverride: null }).quality).toBe(
			'low'
		);
	});
});

describe('parseQuality', () => {
	it('accepts low/high case-insensitively and rejects the rest', () => {
		expect(parseQuality('low')).toBe('low');
		expect(parseQuality('High')).toBe('high');
		expect(parseQuality('medium')).toBeNull();
		expect(parseQuality(null)).toBeNull();
		expect(parseQuality(undefined)).toBeNull();
	});
});

describe('PRESETS', () => {
	it('low turns every post effect and shadows off', () => {
		const p = PRESETS.low;
		expect(Object.values(p.post).every((v) => v === false)).toBe(true);
		expect(p.shadows).toBe(false);
		expect(p.environment).toBe(false);
		expect(p.pixelRatioCap).toBe(1);
		expect(p.toneMapping).toBe('none');
	});

	it('high turns on shadows, AO, reflections and TAA (SSGI off: it hazed the image)', () => {
		const p = PRESETS.high;
		expect(p.post).toMatchObject({ ao: true, ssr: true, taa: true, ssgi: false });
		expect(p.shadows).toBe(true);
		expect(p.shadowMapSize).toBe(4096);
		expect(p.pixelRatioCap).toBe(2);
		expect(p.toneMapping).toBe('neutral');
	});

	it('is frozen so callers cannot mutate it', () => {
		expect(Object.isFrozen(PRESETS)).toBe(true);
		expect(Object.isFrozen(PRESETS.high)).toBe(true);
		expect(Object.isFrozen(PRESETS.high.post)).toBe(true);
		expect(Object.isFrozen(PRESETS.low.post)).toBe(true);
	});
});
