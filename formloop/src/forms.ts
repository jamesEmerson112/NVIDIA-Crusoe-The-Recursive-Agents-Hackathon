// Form versions live in formloop/forms/v<N>.yaml. v1 is the first `questions_shown` questions of the bank.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { EvalConfig, Form, Question } from './types.ts';
import { formloopDir } from './config.ts';

export const formsDir = join(formloopDir, 'forms');
export const formPath = (version: number) => join(formsDir, `v${version}.yaml`);

export function versions(): number[] {
	if (!existsSync(formsDir)) return [];
	return readdirSync(formsDir)
		.map((f) => f.match(/^v(\d+)\.yaml$/)?.[1])
		.filter(Boolean)
		.map(Number)
		.sort((a, b) => a - b);
}

export function loadForm(version: number): Form {
	const path = formPath(version);
	if (!existsSync(path)) throw new Error(`No form version ${version} (${path})`);
	return parse(readFileSync(path, 'utf8')) as Form;
}

export function saveForm(form: Form): string {
	mkdirSync(formsDir, { recursive: true });
	const path = formPath(form.version);
	writeFileSync(path, `# Form v${form.version}${form.parent ? ` (from v${form.parent})` : ''}. Written by formloop; edit research/ instead.\n` + stringify(form));
	return path;
}

/** v1 = the first `questions_shown` questions of research/question_bank.yaml; written once. */
export function ensureV1(bank: Question[], cfg: EvalConfig): Form {
	if (existsSync(formPath(1))) return loadForm(1);
	const form: Form = { version: 1, questions: bank.slice(0, cfg.questions_shown), note: 'Seed form: first questions of the bank.' };
	saveForm(form);
	return form;
}

export function latestForm(bank: Question[], cfg: EvalConfig): Form {
	const vs = versions();
	return vs.length ? loadForm(vs[vs.length - 1]) : ensureV1(bank, cfg);
}
