export type Quality = 'low' | 'high';

export interface QualitySettings {
	pixelRatioCap: number;
	antialias: boolean;
	shadows: boolean;
	shadowMapSize: number;
	environment: boolean;
	toneMapping: 'none' | 'agx';
	post: { ao: boolean; ssgi: boolean; ssr: boolean; taa: boolean; halfResGI: boolean };
}

const LOW: QualitySettings = {
	pixelRatioCap: 1,
	antialias: false,
	shadows: false,
	shadowMapSize: 0,
	environment: false,
	toneMapping: 'none',
	post: Object.freeze({ ao: false, ssgi: false, ssr: false, taa: false, halfResGI: false })
};

// antialias stays false on high too: temporal AA (TRAA) handles it in the post chain.
const HIGH: QualitySettings = {
	pixelRatioCap: 2,
	antialias: false,
	shadows: true,
	shadowMapSize: 4096,
	environment: true,
	toneMapping: 'agx',
	post: Object.freeze({ ao: true, ssgi: false, ssr: true, taa: true, halfResGI: true })
};

export const PRESETS: Record<Quality, QualitySettings> = Object.freeze({
	low: Object.freeze(LOW),
	high: Object.freeze(HIGH)
});

export function parseQuality(value: string | null | undefined): Quality | null {
	const v = value?.trim().toLowerCase();
	return v === 'low' || v === 'high' ? v : null;
}

// Browsers hide GPU core counts, so CPU cores stand in as a proxy for the Apple Silicon tier.
// M3 Max reports 14 or 16; M1/M2/M3 base report 8; M3 Pro reports 11-12 (borderline, treated as
// low unless it hits 12). A threshold of 12 keeps the Max-class demo machine on high.
const HIGH_MIN_CORES = 12;

export function detectQuality(env: {
	hardwareConcurrency: number;
	webgpu: boolean;
	urlOverride?: string | null;
}): { quality: Quality; reason: string } {
	const override = parseQuality(env.urlOverride);
	if (override) return { quality: override, reason: `set by ?quality=${override}` };

	const cores = env.hardwareConcurrency;
	if (!env.webgpu) return { quality: 'low', reason: 'auto: WebGL2 fallback' };
	if (cores >= HIGH_MIN_CORES) {
		return { quality: 'high', reason: `auto: ${cores} CPU cores, WebGPU` };
	}
	return { quality: 'low', reason: `auto: ${cores} CPU cores` };
}
