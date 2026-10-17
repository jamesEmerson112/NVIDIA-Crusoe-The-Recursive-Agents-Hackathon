// Read settings from the environment first, then formloop/.env, then frontend/.env
// (where the team's `npm run set-key` stores the Crusoe key, with every `$` escaped as `\$` for Vite).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const files = ['../.env', '../../frontend/.env'].map((p) => fileURLToPath(new URL(p, import.meta.url)));

let fileVars: Record<string, string> | undefined;

function readFiles(): Record<string, string> {
	if (fileVars) return fileVars;
	fileVars = {};
	// Earlier files win.
	for (const file of [...files].reverse()) {
		if (!existsSync(file)) continue;
		for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
			const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
			if (!m) continue;
			let value = m[2].trim();
			const q = value[0];
			if ((q === "'" || q === '"') && value.endsWith(q) && value.length >= 2) value = value.slice(1, -1);
			fileVars[m[1]] = value.replace(/\\\$/g, '$');
		}
	}
	return fileVars;
}

export function getEnv(name: string): string | undefined {
	const v = process.env[name] ?? readFiles()[name];
	return v && v !== 'paste-your-key-here' ? v : undefined;
}
