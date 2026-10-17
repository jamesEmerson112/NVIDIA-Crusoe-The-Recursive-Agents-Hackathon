// Seeded randomness so every run is reproducible for the demo.

export type Rng = () => number;

/** mulberry32: small, fast, good enough for simulation. Returns floats in [0, 1). */
export function rng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const chance = (r: Rng, p: number) => r() < p;

export function shuffle<T>(r: Rng, xs: readonly T[]): T[] {
	const out = [...xs];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Derive an independent stream from a base seed and a label, e.g. rngFor(seed, 'listings'). */
export function rngFor(seed: number, label: string): Rng {
	let h = seed >>> 0;
	for (const ch of label) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
	return rng(h);
}
