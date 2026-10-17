// Loads and validates the researcher-editable files in <repo>/research/.
// Every loader collects ALL problems in its file and throws one Error listing them,
// each as `research/<file>: <path> (id "<id>"): <problem>`. Unknown keys only warn.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import {
	BEHAVIORS,
	DESTINATIONS,
	LAUNDRY,
	LAYOUTS,
	NEIGHBORHOODS,
	NOISE,
	PETS,
	PREF_FIELDS,
	PREF_OPS,
	QUESTION_TYPES
} from './types.ts';
import type { EvalConfig, Persona, Pref, Question } from './types.ts';

/** Absolute path to <repo>/research/. FORMLOOP_RESEARCH_DIR overrides it (used for testing broken copies). */
export const researchDir: string = process.env.FORMLOOP_RESEARCH_DIR
	? resolve(process.env.FORMLOOP_RESEARCH_DIR)
	: fileURLToPath(new URL('../../research/', import.meta.url));

const warned = new Set<string>();
/** Every warning emitted so far (unknown keys etc.), deduplicated. */
export const researchWarnings: string[] = [];
function warn(msg: string) {
	if (warned.has(msg)) return;
	warned.add(msg);
	researchWarnings.push(msg);
	console.warn(`warning: ${msg}`);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const oneOf = (xs: readonly string[]) => xs.join(', ');
const show = (v: unknown) => JSON.stringify(v) ?? String(v);

/** Collects problems for one file. `where` is the entry label, e.g. `personas[3] (id "dana")`. */
class Problems {
	file: string;
	list: string[] = [];
	constructor(file: string) {
		this.file = `research/${file}`;
	}
	add(where: string, problem: string) {
		this.list.push(where ? `${this.file}: ${where}: ${problem}` : `${this.file}: ${problem}`);
	}
	unknownKeys(where: string, obj: Obj, allowed: readonly string[]) {
		for (const k of Object.keys(obj))
			if (!allowed.includes(k))
				warn(`${this.file}: ${where}: unknown key "${k}" ignored (known: ${oneOf(allowed)})`);
	}
	throwIfAny() {
		if (this.list.length === 0) return;
		const n = this.list.length;
		throw new Error(
			`${this.file} has ${n} problem${n === 1 ? '' : 's'}:\n` + this.list.map((p) => `  - ${p}`).join('\n')
		);
	}
}

/** Read and parse a YAML file; syntax errors are reported with line numbers. */
function readYaml(file: string, p: Problems): unknown {
	const path = resolve(researchDir, file);
	if (!existsSync(path)) {
		p.add('', `file not found at ${path}`);
		p.throwIfAny();
	}
	const doc = parseDocument(readFileSync(path, 'utf8'));
	for (const e of doc.errors) {
		const pos = e.linePos?.[0];
		const msg = e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '');
		p.add(pos ? `line ${pos.line}, col ${pos.col}` : '', `YAML syntax error: ${msg}`);
	}
	p.throwIfAny();
	return doc.toJS();
}

function topList(data: unknown, key: string, p: Problems): unknown[] {
	if (!isObj(data) || !Array.isArray(data[key])) {
		p.add('', `expected a top-level \`${key}:\` list`);
		p.throwIfAny();
	}
	const obj = data as Obj;
	p.unknownKeys('top level', obj, [key]);
	return obj[key] as unknown[];
}

function entryLabel(list: string, i: number, e: unknown): string {
	const id = isObj(e) && typeof e.id === 'string' ? ` (id "${e.id}")` : '';
	return `${list}[${i}]${id}`;
}

// ---------------------------------------------------------------------------------------------
// Questions

const QUESTION_KEYS = ['id', 'text', 'type', 'options', 'maps_to', 'help'] as const;
const SNAKE = /^[a-z][a-z0-9_]*$/;

function checkQuestion(q: unknown, where: string, p: Problems): void {
	if (!isObj(q)) return p.add(where, 'must be a mapping with id, text, type, maps_to');
	p.unknownKeys(where, q, QUESTION_KEYS);
	if (!isStr(q.id)) p.add(where, 'id is required (a snake_case string)');
	else if (!SNAKE.test(q.id)) p.add(where, `id "${q.id}" must be snake_case (lowercase letters, digits, _)`);
	if (!isStr(q.text)) p.add(where, 'text is required');
	if (!QUESTION_TYPES.includes(q.type as never))
		p.add(where, `type ${show(q.type)} must be one of ${oneOf(QUESTION_TYPES)}`);
	const needsOptions = q.type === 'select' || q.type === 'multiselect';
	if (needsOptions) {
		if (!Array.isArray(q.options) || q.options.length === 0)
			p.add(where, `options must be a non-empty list for type ${q.type}`);
		else {
			q.options.forEach((o, j) => {
				if (!isStr(o) && !isNum(o)) p.add(where, `options[${j}] must be a string`);
			});
			const strs = q.options.map(String);
			const dup = strs.find((o, j) => strs.indexOf(o) !== j);
			if (dup !== undefined) p.add(where, `options has duplicate "${dup}"`);
		}
	} else if (q.options !== undefined) warn(`${p.file}: ${where}: options ignored for type ${show(q.type)}`);
	if (!Array.isArray(q.maps_to) || q.maps_to.length === 0)
		p.add(where, `maps_to must be a non-empty list of: ${oneOf(PREF_FIELDS)}`);
	else
		q.maps_to.forEach((f, j) => {
			if (!PREF_FIELDS.includes(f as never)) p.add(where, `maps_to[${j}] ${show(f)} must be one of ${oneOf(PREF_FIELDS)}`);
		});
	if (q.help !== undefined && typeof q.help !== 'string') p.add(where, 'help must be a string');
}

/** Validate a list of questions (e.g. a reviewer-proposed form). Returns problem strings; never throws. */
export function checkQuestions(questions: unknown[], file = 'question_bank.yaml', list = 'questions'): string[] {
	const p = new Problems(file);
	const seen = new Map<string, number>();
	questions.forEach((q, i) => {
		const where = entryLabel(list, i, q);
		checkQuestion(q, where, p);
		if (isObj(q) && typeof q.id === 'string') {
			if (seen.has(q.id)) p.add(where, `duplicate id (also ${list}[${seen.get(q.id)}])`);
			else seen.set(q.id, i);
		}
	});
	return p.list;
}

export function loadQuestionBank(): Question[] {
	const p = new Problems('question_bank.yaml');
	const list = topList(readYaml('question_bank.yaml', p), 'questions', p);
	if (list.length === 0) p.add('questions', 'must contain at least one question');
	p.list.push(...checkQuestions(list));
	p.throwIfAny();
	return (list as Question[]).map((q) => ({
		...q,
		...(q.options ? { options: q.options.map(String) } : {})
	}));
}

// ---------------------------------------------------------------------------------------------
// Prefs and personas

const PREF_KEYS = ['field', 'op', 'value', 'dest', 'weight', 'hard', 'from'] as const;
const NUMERIC_FIELDS = ['price', 'bedrooms', 'sqft', 'floor', 'commute'];
const LIST_FIELDS: Record<string, readonly string[]> = {
	neighborhood: NEIGHBORHOODS,
	layout: LAYOUTS,
	laundry: LAUNDRY,
	pets: PETS,
	street_noise: NOISE
};
/** Which ops make sense for which field. */
function opsFor(field: string): readonly string[] {
	if (NUMERIC_FIELDS.includes(field)) return ['max', 'min', 'eq'];
	if (field === 'available') return ['max', 'min'];
	if (field === 'parking') return ['eq'];
	return ['in', 'not_in'];
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (v: unknown) =>
	typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v);

/** Problems with one Pref, each prefixed with `at` (e.g. `hidden[1]`). */
function checkPref(pref: unknown, at: string, where: string, p: Problems): void {
	if (!isObj(pref)) return p.add(where, `${at} must be a mapping like { field, op, value, weight }`);
	p.unknownKeys(`${where} ${at}`, pref, PREF_KEYS);
	const { field, op, value } = pref;
	if (!PREF_FIELDS.includes(field as never)) {
		p.add(where, `${at}.field ${show(field)} must be one of ${oneOf(PREF_FIELDS)}`);
		return;
	}
	const f = field as string;
	if (!PREF_OPS.includes(op as never)) p.add(where, `${at}.op ${show(op)} must be one of ${oneOf(PREF_OPS)}`);
	else if (!opsFor(f).includes(op as string))
		p.add(where, `${at}.op "${op}" does not apply to ${f}; use one of ${oneOf(opsFor(f))}`);
	else if (op === 'in' || op === 'not_in') {
		const allowed = LIST_FIELDS[f];
		if (!Array.isArray(value) || value.length === 0)
			p.add(where, `${at}.value must be a non-empty list for op ${op} (got ${show(value)})`);
		else
			value.forEach((v, j) => {
				if (!allowed.includes(v as never)) p.add(where, `${at}.value[${j}] ${show(v)} must be one of ${oneOf(allowed)}`);
			});
	} else if (f === 'available') {
		if (!isIsoDate(value)) p.add(where, `${at}.value ${show(value)} must be an ISO date like "2026-12-01" (quote it)`);
	} else if (f === 'parking') {
		if (typeof value !== 'boolean') p.add(where, `${at}.value ${show(value)} must be true or false`);
	} else if (!isNum(value)) {
		p.add(where, `${at}.value ${show(value)} must be a number for ${f}`);
	} else {
		if (value < 0) p.add(where, `${at}.value ${value} must be >= 0`);
		if (f === 'price' && value > 0 && (value < 500 || value > 20000))
			warn(`${p.file}: ${where}: ${at}.value ${value} looks off for monthly rent in USD`);
	}
	if (f === 'commute') {
		if (pref.dest === undefined) p.add(where, `${at}.dest is required for commute; use one of ${oneOf(DESTINATIONS)}`);
		else if (!DESTINATIONS.includes(pref.dest as never))
			p.add(where, `${at}.dest ${show(pref.dest)} must be one of ${oneOf(DESTINATIONS)}`);
	} else if (pref.dest !== undefined) warn(`${p.file}: ${where}: ${at}.dest ignored (only used for commute)`);
	if (!isNum(pref.weight) || pref.weight < 0 || pref.weight > 3)
		p.add(where, `${at}.weight ${show(pref.weight)} must be a number from 0 to 3`);
	if (pref.hard !== undefined && typeof pref.hard !== 'boolean') p.add(where, `${at}.hard must be true or false`);
	if (pref.from !== undefined && typeof pref.from !== 'string') p.add(where, `${at}.from must be a question id string`);
}

const PERSONA_KEYS = ['id', 'name', 'blurb', 'behavior', 'hidden', 'dealbreaker'] as const;

function checkPersona(x: unknown, where: string, p: Problems): void {
	if (!isObj(x)) return p.add(where, 'must be a mapping with id, name, blurb, behavior, hidden, dealbreaker');
	p.unknownKeys(where, x, PERSONA_KEYS);
	if (!isStr(x.id)) p.add(where, 'id is required');
	if (!isStr(x.name)) p.add(where, 'name is required');
	if (!isStr(x.blurb)) p.add(where, 'blurb is required (1-2 sentences in character)');
	if (!BEHAVIORS.includes(x.behavior as never))
		p.add(where, `behavior ${show(x.behavior)} must be one of ${oneOf(BEHAVIORS)}`);
	if (!Array.isArray(x.hidden) || x.hidden.length === 0) p.add(where, 'hidden must be a non-empty list of preferences');
	else x.hidden.forEach((h, j) => checkPref(h, `hidden[${j}]`, where, p));
	// Weight is optional on a dealbreaker (it is hard anyway; loadPersonas defaults it to 3).
	if (x.dealbreaker === undefined) p.add(where, 'dealbreaker is required (one preference)');
	else checkPref(isObj(x.dealbreaker) ? { weight: 3, ...x.dealbreaker } : x.dealbreaker, 'dealbreaker', where, p);
}

/** Validate personas (seeds or generated). Returns problem strings; never throws. */
export function checkPersonas(personas: unknown[], file = 'personas.yaml', list = 'personas'): string[] {
	const p = new Problems(file);
	const seen = new Map<string, number>();
	personas.forEach((x, i) => {
		const where = entryLabel(list, i, x);
		checkPersona(x, where, p);
		if (isObj(x) && typeof x.id === 'string') {
			if (seen.has(x.id)) p.add(where, `duplicate id (also ${list}[${seen.get(x.id)}])`);
			else seen.set(x.id, i);
		}
	});
	return p.list;
}

export function loadPersonas(): Persona[] {
	const p = new Problems('personas.yaml');
	const list = topList(readYaml('personas.yaml', p), 'personas', p);
	if (list.length === 0) p.add('personas', 'must contain at least one persona');
	p.list.push(...checkPersonas(list));
	p.throwIfAny();
	return (list as Persona[]).map((x) => ({ ...x, dealbreaker: { ...x.dealbreaker, weight: x.dealbreaker.weight ?? 3, hard: true } }));
}

// ---------------------------------------------------------------------------------------------
// Eval config

const EVAL_KEYS = [
	'seed',
	'listings',
	'train_batch_size',
	'acceptance_batch_size',
	'heldout_size',
	'questions_shown',
	'friction_weight',
	'friction',
	'top_k',
	'rounds'
] as const;
const LISTING_SOURCES = ['synthetic', 'youcom', 'both'] as const;

export function loadEvalConfig(): EvalConfig {
	const p = new Problems('eval_config.yaml');
	const c = readYaml('eval_config.yaml', p);
	if (!isObj(c)) {
		p.add('', 'expected a mapping of config fields');
		p.throwIfAny();
	}
	const cfg = c as Obj;
	p.unknownKeys('top level', cfg, EVAL_KEYS);
	const posInt = (v: unknown, at: string) => {
		if (v === undefined) p.add(at, 'is required');
		else if (!isInt(v) || (v as number) < 1) p.add(at, `${show(v)} must be a whole number >= 1`);
	};
	const nonNeg = (v: unknown, at: string) => {
		if (v === undefined) p.add(at, 'is required');
		else if (!isNum(v) || v < 0) p.add(at, `${show(v)} must be a number >= 0`);
	};

	if (cfg.seed === undefined) p.add('seed', 'is required');
	else if (!isInt(cfg.seed) || (cfg.seed as number) < 0) p.add('seed', `${show(cfg.seed)} must be a whole number >= 0`);

	if (!isObj(cfg.listings)) p.add('listings', 'is required: { source, count }');
	else {
		p.unknownKeys('listings', cfg.listings, ['source', 'count']);
		if (!LISTING_SOURCES.includes(cfg.listings.source as never))
			p.add('listings.source', `${show(cfg.listings.source)} must be one of ${oneOf(LISTING_SOURCES)}`);
		posInt(cfg.listings.count, 'listings.count');
	}
	posInt(cfg.train_batch_size, 'train_batch_size');
	posInt(cfg.acceptance_batch_size, 'acceptance_batch_size');
	posInt(cfg.heldout_size, 'heldout_size');
	posInt(cfg.questions_shown, 'questions_shown');
	nonNeg(cfg.friction_weight, 'friction_weight');
	if (!isObj(cfg.friction)) p.add('friction', 'is required: { skip, rewrite, per_second }');
	else {
		p.unknownKeys('friction', cfg.friction, ['skip', 'rewrite', 'per_second']);
		nonNeg(cfg.friction.skip, 'friction.skip');
		nonNeg(cfg.friction.rewrite, 'friction.rewrite');
		nonNeg(cfg.friction.per_second, 'friction.per_second');
	}
	posInt(cfg.top_k, 'top_k');
	posInt(cfg.rounds, 'rounds');

	// questions_shown can't exceed the bank. If the bank is invalid, count its raw entries instead
	// (its own loader reports its problems).
	if (isInt(cfg.questions_shown)) {
		let bankSize: number | undefined;
		try {
			bankSize = loadQuestionBank().length;
		} catch {
			try {
				const doc = parseDocument(readFileSync(resolve(researchDir, 'question_bank.yaml'), 'utf8'));
				const raw = doc.errors.length ? undefined : doc.toJS();
				if (isObj(raw) && Array.isArray(raw.questions)) bankSize = raw.questions.length;
			} catch {
				bankSize = undefined;
			}
		}
		if (bankSize !== undefined && (cfg.questions_shown as number) > bankSize)
			p.add('questions_shown', `${cfg.questions_shown} is more than the ${bankSize} questions in question_bank.yaml`);
	}
	p.throwIfAny();
	return cfg as EvalConfig;
}

// ---------------------------------------------------------------------------------------------
// Notes

export function loadNotes(): string {
	const p = new Problems('NOTES.md');
	const path = resolve(researchDir, 'NOTES.md');
	if (!existsSync(path)) p.add('', `file not found at ${path}`);
	else {
		const text = readFileSync(path, 'utf8');
		if (text.trim() === '') p.add('', 'is empty; the reviewer reads it as context, so add at least a header');
		else return text;
	}
	p.throwIfAny();
	return '';
}
