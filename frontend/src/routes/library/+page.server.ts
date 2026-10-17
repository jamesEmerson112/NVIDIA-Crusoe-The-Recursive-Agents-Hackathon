import { searchArtifacts } from '#lib/server/store.ts';
import type { ArtifactKind } from '#lib/types.ts';

const KINDS = ['form', 'widget', 'document', 'html'] as const;

export async function load({ url }) {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const kindParam = url.searchParams.get('kind');
	const kind = KINDS.find((k) => k === kindParam) as ArtifactKind | undefined;
	return { q, kind: kind ?? null, results: await searchArtifacts(q, kind) };
}
