// Bundled blueprints (static/plans/<id>.json) that a blueprint artifact can point at.
export const BLUEPRINT_PLANS = [
	{ id: 'sf-studio', label: 'Studio' },
	{ id: 'sf-1br', label: '1 bedroom' },
	{ id: 'sf-2br', label: '2 bedroom' },
	{ id: 'sample-1br', label: 'Sample 1BR' }
] as const;

export type BlueprintPlanId = (typeof BLUEPRINT_PLANS)[number]['id'];

export const isBlueprintPlan = (id: unknown): id is BlueprintPlanId =>
	BLUEPRINT_PLANS.some((p) => p.id === id);

export const planLabel = (id: string) => BLUEPRINT_PLANS.find((p) => p.id === id)?.label ?? id;
