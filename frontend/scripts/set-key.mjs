// Store the Crusoe API key in frontend/.env without it touching the shell or chat history.
// Vite expands `$name` inside .env values even when single-quoted, and Crusoe keys can
// contain `$`, so every `$` is written as `\$`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));

function readHidden(prompt) {
	return new Promise((resolve, reject) => {
		const { stdin, stdout } = process;
		if (!stdin.isTTY) {
			// Piped input: read it all.
			let data = '';
			stdin.setEncoding('utf8');
			stdin.on('data', (c) => (data += c));
			stdin.on('end', () => resolve(data.trim()));
			return;
		}
		stdout.write(prompt);
		stdin.setRawMode(true);
		stdin.setEncoding('utf8');
		let value = '';
		const onData = (chunk) => {
			for (const ch of chunk) {
				if (ch === '\r' || ch === '\n') {
					stdin.setRawMode(false);
					stdin.pause();
					stdin.off('data', onData);
					stdout.write('\n');
					return resolve(value.trim());
				}
				if (ch === '\u0003') {
					stdin.setRawMode(false);
					stdout.write('\n');
					return reject(new Error('Cancelled'));
				}
				if (ch === '\u007f' || ch === '\b') {
					if (value) {
						value = value.slice(0, -1);
						stdout.write('\b \b');
					}
					continue;
				}
				value += ch;
				stdout.write('*');
			}
		};
		stdin.on('data', onData);
		stdin.resume();
	});
}

const key = await readHidden('Paste your Crusoe API key (input is hidden), then press Enter: ');
if (!key) {
	console.error('No key entered; .env not changed.');
	process.exit(1);
}
if (/\s/.test(key)) {
	console.error(
		'The key contains whitespace, which suggests a copy/paste problem; .env not changed.'
	);
	process.exit(1);
}

const line = `CRUSOE_API_KEY=${key.replaceAll('$', '\\$')}`;
const current = existsSync(envPath)
	? readFileSync(envPath, 'utf8')
	: '# Drizzle\nDATABASE_URL=local.db\n';
const next = /^CRUSOE_API_KEY=.*$/m.test(current)
	? current.replace(/^CRUSOE_API_KEY=.*$/m, () => line)
	: `${current.replace(/\n?$/, '\n')}\n# Crusoe Managed Inference (written by npm run set-key; $ is escaped as \\$ for Vite)\n${line}\n`;
writeFileSync(envPath, next, { mode: 0o600 });

console.log(
	`Saved CRUSOE_API_KEY (${key.length} characters, ending …${key.slice(-4)}) to frontend/.env.`
);
console.log('Next: npm run models   (checks the key and the configured model IDs)');
console.log('Then restart the dev server so it picks up the key.');
