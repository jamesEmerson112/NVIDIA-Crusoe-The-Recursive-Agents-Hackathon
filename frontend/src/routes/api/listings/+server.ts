import { json } from '@sveltejs/kit';
import { allListings } from '#lib/server/listings.ts';

/** Listing summaries, the same shape as formloop's GET /api/listings. */
export function GET() {
	return json(
		allListings().map((l) => ({
			id: l.id,
			neighborhood: l.neighborhood,
			price: l.price,
			bedrooms: l.bedrooms,
			title: l.title
		}))
	);
}
