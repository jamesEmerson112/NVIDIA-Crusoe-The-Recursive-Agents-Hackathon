// Shared contracts for the form loop. Every module and every research/*.yaml file follows these.

/** Places renters commute to; listing.commute has minutes by transit for each. */
export const DESTINATIONS = ['fidi', 'soma', 'mission_bay', 'palo_alto'] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const NEIGHBORHOODS = [
	'Mission',
	'SoMa',
	'Hayes Valley',
	'Nob Hill',
	'Pacific Heights',
	'Marina',
	'Inner Sunset',
	'Outer Sunset',
	'Inner Richmond',
	'Outer Richmond',
	'Noe Valley',
	'Castro',
	'Bernal Heights',
	'Potrero Hill',
	'Dogpatch',
	'Tenderloin',
	'North Beach',
	'Russian Hill',
	'Lower Haight',
	'Excelsior'
] as const;

export const LAYOUTS = ['standard', 'open', 'railroad', 'loft', 'irregular'] as const;
export const LAUNDRY = ['in_unit', 'in_building', 'none'] as const;
export const PETS = ['cats', 'dogs', 'both', 'none'] as const;
export const NOISE = ['quiet', 'moderate', 'lively'] as const;

export type Listing = {
	id: string;
	source: 'synthetic' | 'youcom';
	url?: string;
	title: string;
	neighborhood: string;
	/** Monthly rent, USD. */
	price: number;
	/** 0 = studio. */
	bedrooms: number;
	bathrooms: number;
	sqft: number | null;
	floor: number | null;
	layout: (typeof LAYOUTS)[number] | null;
	laundry: (typeof LAUNDRY)[number] | null;
	parking: boolean | null;
	/** Which pets the building allows. */
	pets: (typeof PETS)[number] | null;
	street_noise: (typeof NOISE)[number] | null;
	/** ISO date the unit is available. */
	available: string | null;
	/** Transit minutes to each destination; null when unknown. */
	commute: Record<Destination, number | null>;
};

/** Listing attributes a preference can target. `commute` also needs `dest`. */
export const PREF_FIELDS = [
	'price',
	'neighborhood',
	'bedrooms',
	'sqft',
	'available',
	'floor',
	'layout',
	'laundry',
	'parking',
	'pets',
	'street_noise',
	'commute'
] as const;
export type PrefField = (typeof PREF_FIELDS)[number];

export const PREF_OPS = ['max', 'min', 'in', 'not_in', 'eq'] as const;

/**
 * One preference. Used for a persona's hidden truth and for what the agent extracts from answers,
 * so the matcher and the scorer share one utility function.
 * - max/min: numbers (price, bedrooms, sqft, floor, commute minutes) or ISO dates (available)
 * - in/not_in: value is a list (neighborhood, layout, laundry, pets, street_noise)
 * - eq: single value (parking true/false)
 */
export type Pref = {
	field: PrefField;
	op: (typeof PREF_OPS)[number];
	value: number | string | boolean | string[];
	/** Required when field is 'commute'. */
	dest?: Destination;
	/** Importance 0..3. */
	weight: number;
	/** Dealbreaker: a listing that violates it is out. */
	hard?: boolean;
	/** Question id the preference came from; ablation drops these to measure a question's value. */
	from?: string;
	/** Set when the preference grounds a renter's own factor ("near the 14 bus") via web search. */
	factor?: { text: string; sources: string[]; confidence: number };
};

export const QUESTION_TYPES = ['number', 'select', 'multiselect', 'text', 'yesno'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type Question = {
	/** Stable snake_case id; reaction logs key on it across form versions. */
	id: string;
	text: string;
	type: QuestionType;
	/** For select and multiselect. */
	options?: string[];
	/** Listing fields this question informs. */
	maps_to: PrefField[];
	/** Optional hint for answering offline or explaining the question. */
	help?: string;
	/** A promoted factor: answering yes (or anything but no) applies this web-grounded preference. */
	resolved?: { factor: string; pref: Pref; sources: string[] };
};

export type Form = {
	version: number;
	parent?: number;
	questions: Question[];
	/** Reviewer's summary of what changed and why. */
	note?: string;
	/** Mean objective on the acceptance batch when this version was accepted. */
	score?: number;
};

export const BEHAVIORS = [
	'answers_everything',
	'skips_money',
	'rewrites_vague',
	'skips_all',
	'terse'
] as const;
export type Behavior = (typeof BEHAVIORS)[number];

export type Persona = {
	id: string;
	name: string;
	/** One or two sentences in character, shown to the renter simulator. */
	blurb: string;
	behavior: Behavior;
	/** True preferences with true weights. Never shown to the matcher or the reviewer. */
	hidden: Pref[];
	/** Hidden dealbreaker; always treated as hard. */
	dealbreaker: Pref;
};

export type Answer = {
	question_id: string;
	action: 'answer' | 'skip' | 'rewrite';
	/** Free text, number, or option(s). Present for answer and rewrite. */
	value?: string | number | string[];
	/** For rewrite: the question as the renter re-worded it before answering. */
	rewritten_text?: string;
	/** Importance slider 0..3, default 1. */
	importance?: number;
	/** Simulated seconds spent on the question. */
	seconds?: number;
};

export type EvalConfig = {
	seed: number;
	listings: { source: 'synthetic' | 'youcom' | 'both'; count: number };
	train_batch_size: number;
	acceptance_batch_size: number;
	heldout_size: number;
	/** Max questions shown to a renter. */
	questions_shown: number;
	/** Objective = match quality - friction_weight * friction. */
	friction_weight: number;
	friction: { skip: number; rewrite: number; per_second: number };
	/** Recommendations shown per round in the inner loop. */
	top_k: number;
	/** Like/pass reaction rounds per renter. */
	rounds: number;
};
