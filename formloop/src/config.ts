import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { getEnv } from './env.ts';

export type Role = 'simulator' | 'extractor' | 'normalizer' | 'reviewer';
export type RoleConfig = {
	model: string;
	max_tokens: number;
	temperature?: number;
	extra?: Record<string, unknown>;
};
export type Config = { base_url: string; rpm: number; roles: Record<Role, RoleConfig> };

export const formloopDir = fileURLToPath(new URL('..', import.meta.url));

let cached: Config | undefined;

export function loadConfig(): Config {
	if (cached) return cached;
	const path = fileURLToPath(new URL('../config.yaml', import.meta.url));
	const cfg = parse(readFileSync(path, 'utf8')) as Config;
	for (const role of ['simulator', 'extractor', 'normalizer', 'reviewer'] as const) {
		const r = cfg.roles?.[role];
		if (!r?.model || !r.max_tokens) throw new Error(`formloop/config.yaml: roles.${role} needs model and max_tokens`);
		// Per-role override, e.g. CRUSOE_REVIEWER_MODEL=deepseek-ai/DeepSeek-V4-Pro
		const override = getEnv(`CRUSOE_${role.toUpperCase()}_MODEL`);
		if (override) r.model = override;
	}
	cfg.base_url = (getEnv('CRUSOE_BASE_URL') || cfg.base_url).replace(/\/+$/, '');
	cached = cfg;
	return cfg;
}
