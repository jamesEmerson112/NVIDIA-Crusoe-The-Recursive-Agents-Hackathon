// Floor plans drawn from a listing's own data (bedrooms, bathrooms, sqft, layout, laundry, floor):
// every listing gets its own plan, deterministic per listing id. Style: architect's sales plan.
// Usage: floorplanSVG(listing) -> SVG markup string.
(function () {
	const INK = 'var(--plan-ink, #16291f)';
	const FT = 6; // pixels per foot

	function seeded(id) {
		let h = 2166136261;
		for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
		return () => {
			h = (h + 0x6d2b79f5) >>> 0;
			let t = Math.imul(h ^ (h >>> 15), h | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	const rect = (x, y, w, h) => ({ x, y, w, h });
	const label = (r, text, sub) =>
		`<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - (sub ? 4 : 0)}" class="fp-label">${text}</text>` +
		(sub ? `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 9}" class="fp-sub">${sub}</text>` : '');

	function door(x, y, size, dir) {
		// Quarter-circle swing; dir says which way the door opens from a hinge at (x, y).
		const s = size;
		const [dx, dy] = { ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] }[dir];
		return (
			`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + dy * s}" class="fp-door"/>` +
			`<path d="M ${x} ${y + dy * s} A ${s} ${s} 0 0 ${dx * dy > 0 ? 0 : 1} ${x + dx * s} ${y}" class="fp-swing"/>`
		);
	}

	function bath(r, rnd) {
		const tubW = Math.min(r.w - 8, 5 * FT);
		const out = [
			`<rect x="${r.x + r.w - tubW - 4}" y="${r.y + r.h - 2.6 * FT - 4}" width="${tubW}" height="${2.6 * FT}" rx="3" class="fp-fix"/>`,
			`<ellipse cx="${r.x + 1.3 * FT + 4}" cy="${r.y + r.h / 2 - 2}" rx="${0.9 * FT}" ry="${1.2 * FT}" class="fp-fix"/>`,
			`<rect x="${r.x + 4}" y="${r.y + 4}" width="${2.2 * FT}" height="${1.6 * FT}" rx="2" class="fp-fix"/>`
		];
		return out.join('') + (rnd() < 0.5 ? '' : '');
	}

	function kitchen(r, along) {
		// Counter along one wall with sink, two burners, dishwasher (dashed) and a fridge box.
		const d = 2 * FT;
		if (along === 'right') {
			const x = r.x + r.w - d - 3;
			return (
				`<rect x="${x}" y="${r.y + 3}" width="${d}" height="${r.h - 6}" class="fp-counter"/>` +
				`<rect x="${x + 2}" y="${r.y + r.h * 0.18}" width="${d - 4}" height="${1.6 * FT}" class="fp-fix fp-dash"/>` +
				`<rect x="${x + 3}" y="${r.y + r.h * 0.42}" width="${d - 6}" height="${1.5 * FT}" rx="2" class="fp-fix"/>` +
				`<circle cx="${x + d / 2 - 3}" cy="${r.y + r.h * 0.7}" r="2.6" class="fp-fix"/><circle cx="${x + d / 2 + 3}" cy="${r.y + r.h * 0.7 + 6}" r="2.6" class="fp-fix"/>` +
				`<rect x="${r.x + 4}" y="${r.y + r.h - 2.6 * FT - 3}" width="${2.6 * FT}" height="${2.6 * FT}" class="fp-fix"/><text x="${r.x + 4 + 1.3 * FT}" y="${r.y + r.h - 1.3 * FT}" class="fp-mini">REF</text>`
			);
		}
		const y = r.y + r.h - d - 3;
		return (
			`<rect x="${r.x + 3}" y="${y}" width="${r.w - 6}" height="${d}" class="fp-counter"/>` +
			`<rect x="${r.x + r.w * 0.2}" y="${y + 2}" width="${1.6 * FT}" height="${d - 4}" class="fp-fix fp-dash"/>` +
			`<rect x="${r.x + r.w * 0.42}" y="${y + 3}" width="${1.5 * FT}" height="${d - 6}" rx="2" class="fp-fix"/>` +
			`<circle cx="${r.x + r.w * 0.7}" cy="${y + d / 2 - 3}" r="2.6" class="fp-fix"/><circle cx="${r.x + r.w * 0.7 + 7}" cy="${y + d / 2 + 3}" r="2.6" class="fp-fix"/>` +
			`<rect x="${r.x + r.w - 2.6 * FT - 3}" y="${r.y + 3}" width="${2.6 * FT}" height="${2.6 * FT}" class="fp-fix"/><text x="${r.x + r.w - 1.3 * FT - 3}" y="${r.y + 1.3 * FT + 6}" class="fp-mini">REF</text>`
		);
	}

	function windows(r, side) {
		// Window: a gap in the exterior wall drawn as a thin double line.
		const n = Math.max(1, Math.round((side === 'top' ? r.w : r.h) / (9 * FT)));
		let out = '';
		for (let i = 0; i < n; i++) {
			if (side === 'top') {
				const len = Math.min(r.w / n - 10, 5 * FT);
				const x = r.x + (r.w / n) * (i + 0.5) - len / 2;
				out += `<rect x="${x}" y="${r.y - 4}" width="${len}" height="8" class="fp-window"/><line x1="${x}" y1="${r.y}" x2="${x + len}" y2="${r.y}" class="fp-pane"/>`;
			} else {
				const len = Math.min(r.h / n - 10, 5 * FT);
				const y = r.y + (r.h / n) * (i + 0.5) - len / 2;
				const x = side === 'left' ? r.x : r.x + r.w;
				out += `<rect x="${x - 4}" y="${y}" width="8" height="${len}" class="fp-window"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y + len}" class="fp-pane"/>`;
			}
		}
		return out;
	}

	function closets(r) {
		const n = Math.max(1, Math.floor((r.w - 10) / (3.2 * FT)));
		const w = (r.w - 10) / n;
		let out = `<line x1="${r.x + 5}" y1="${r.y + r.h - 2.2 * FT}" x2="${r.x + r.w - 5}" y2="${r.y + r.h - 2.2 * FT}" class="fp-dash fp-thin"/>`;
		for (let i = 0; i < n; i++) {
			const x = r.x + 5 + i * w;
			out += `<path d="M ${x} ${r.y + r.h - 2.2 * FT} L ${x + w / 2} ${r.y + r.h - 3.2 * FT} L ${x + w} ${r.y + r.h - 2.2 * FT}" class="fp-thin"/>`;
		}
		return out;
	}

	function plan(l) {
		const rnd = seeded(l.id);
		const beds = Math.min(3, l.bedrooms ?? 1);
		const baths = Math.max(1, Math.min(2, Math.round(l.bathrooms ?? 1)));
		const sqft = l.sqft || [450, 650, 950, 1250][beds];
		const layout = l.layout || 'standard';
		const rooms = [];
		const extras = [];
		let W, H;

		if (layout === 'railroad') {
			// Rooms in a line, front to back; bedrooms are walk-through.
			W = Math.sqrt(sqft / 3) * FT;
			H = (sqft * FT * FT) / W;
			const seq = [['LIVING', 1.3], ...Array.from({ length: Math.max(1, beds) }, (_, i) => [beds ? 'BEDROOM' : 'SLEEPING', 1]), ['KITCHEN', 0.8], ['BATH', 0.45]];
			const total = seq.reduce((a, [, f]) => a + f, 0);
			let y = 0;
			for (const [name, f] of seq) {
				const h = (H * f) / total;
				rooms.push({ name, r: rect(0, y, W, h) });
				y += h;
			}
		} else if (beds === 0) {
			// Studio: one main room over a kitchen and bath.
			W = Math.sqrt(sqft * 0.8) * FT;
			H = (sqft * FT * FT) / W;
			const top = H * 0.66;
			rooms.push({ name: layout === 'loft' ? 'LOFT' : 'LIVING / SLEEPING', r: rect(0, 0, W, top) });
			rooms.push({ name: 'BATH', r: rect(0, top, W * 0.4, H - top) });
			rooms.push({ name: 'KITCHEN', r: rect(W * 0.4, top, W * 0.6, H - top), open: layout === 'open' || layout === 'loft' });
		} else {
			// Bedrooms stacked on the left, then bath(s), then a W/D or closet by the entry; living over kitchen on the right.
			W = Math.sqrt(sqft * 1.15) * FT;
			H = (sqft * FT * FT) / W;
			const leftW = W * (beds >= 2 ? 0.5 : 0.46);
			const ensuite = baths > 1 && beds > 1;
			const bathH = Math.min(H * 0.3, 8 * FT);
			const free = H - bathH * (ensuite ? 2 : 1);
			const bedH = Math.min(free / beds, Math.max(10 * FT, Math.min(14 * FT, free / beds)));
			let y = 0;
			for (let i = 0; i < beds; i++) {
				rooms.push({ name: 'BEDROOM', r: rect(0, y, leftW, bedH), bed: true });
				y += bedH;
				if (i === 0 && ensuite) {
					rooms.push({ name: 'ENSUITE', r: rect(0, y, leftW, bathH), bath: true });
					y += bathH;
				}
			}
			const rest = H - y - bathH;
			const bathR = rect(0, y, leftW, rest > 3.5 * FT ? bathH : H - y);
			rooms.push({ name: 'BATH', r: bathR, bath: true });
			if (rest > 3.5 * FT) rooms.push({ name: l.laundry === 'in_unit' ? 'W/D' : 'CLOSET', r: rect(0, y + bathH, leftW, rest), small: true });
			const livingH = H * (layout === 'open' ? 0.62 : 0.58);
			const living = rect(leftW, 0, W - leftW, livingH);
			rooms.push({ name: living.w < 17 * FT ? 'LIVING' : 'LIVING / DINING', r: living });
			rooms.push({ name: 'KITCHEN', r: rect(leftW, livingH, W - leftW, H - livingH), open: layout === 'open' || layout === 'loft', kitchenRight: true });
		}
		if (beds === 0 && l.laundry === 'in_unit') extras.push({ name: 'W/D', r: rect(0, H - 5 * FT, 5 * FT, 5 * FT) });
		return { W, H, rooms, extras, layout, chamfer: layout === 'irregular' ? Math.min(W, H) * 0.18 : 0, rnd, beds, baths, sqft };
	}

	window.floorplanSVG = function floorplanSVG(l) {
		const p = plan(l);
		const pad = 22;
		const { W, H, chamfer: c } = p;
		const outline = c
			? `M 0 ${c} L ${c} 0 L ${W - c} 0 L ${W} ${c} L ${W} ${H} L 0 ${H} Z`
			: `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;
		let body = '';
		for (const { name, r, open, bath: isBath, bed, kitchenRight, small } of p.rooms) {
			const dashed = p.layout === 'loft' && (bed || name === 'LOFT');
			if (!open) body += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="fp-wall${dashed ? ' fp-half' : ''}"/>`;
			else body += `<line x1="${r.x}" y1="${r.y}" x2="${r.x}" y2="${r.y + r.h}" class="fp-wall"/>`;
			if (isBath || name === 'BATH') body += bath(r, p.rnd);
			if (name === 'KITCHEN') body += kitchen(r, kitchenRight ? 'right' : 'bottom');
			if (bed) body += closets(r);
			if (r.y <= 0.5) body += windows(r, 'top');
			else if (r.x <= 0.5 && (bed || name === 'LIVING') && p.layout !== 'railroad') body += windows(r, 'left');
			// Doors: bedrooms and baths open toward the living side.
			if (bed || isBath || name === 'BATH' || small) body += door(r.x + r.w, r.y + Math.min(r.h - 4, 3.2 * FT), 2.8 * FT, 'sw');
			if (p.layout === 'railroad' && r.y > 0.5) body += door(r.x + r.w * 0.7, r.y, 2.6 * FT, 'se');
			const sub = name === 'BEDROOM' ? `${Math.round(r.w / FT)}' × ${Math.round(r.h / FT)}'` : '';
			if (small) body += `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 3}" class="fp-mini">${name}</text>`;
			else if (isBath || name === 'BATH') body += `<text x="${r.x + r.w / 2}" y="${r.y + 13}" class="fp-label">${name}</text>`;
			else body += label(r, name, sub);
		}
		for (const { name, r } of p.extras) body += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="fp-wall"/><text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 3}" class="fp-mini">${name}</text>`;
		// Entry: a gap and arrow at the bottom edge.
		const ex = p.beds === 0 ? W * 0.7 : W * 0.6;
		body += `<rect x="${ex}" y="${H - 5}" width="${3 * FT}" height="10" fill="var(--plan-bg, #fff)"/><path d="M ${ex + 1.5 * FT} ${H + 14} l -5 -8 l 10 0 z" fill="${INK}"/>`;
		const caption = `${p.beds === 0 ? 'STUDIO' : p.beds + ' BED'} · ${p.baths} BATH · ${Math.round(p.sqft)} SQ FT${l.floor != null ? ' · FLOOR ' + l.floor : ''}`;
		return `<svg viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2 + 16}" class="fp" role="img" aria-label="Floor plan: ${caption}">
<style>
.fp-out{fill:var(--plan-bg,#fff);stroke:${INK};stroke-width:8;stroke-linejoin:miter}
.fp-wall{fill:none;stroke:${INK};stroke-width:3.5}
.fp-half{stroke-dasharray:6 4;stroke-width:2.5}
.fp-fix{fill:none;stroke:${INK};stroke-width:1.2}
.fp-counter{fill:none;stroke:${INK};stroke-width:1.4}
.fp-dash{stroke-dasharray:3 2}
.fp-thin{fill:none;stroke:${INK};stroke-width:1}
.fp-door{stroke:${INK};stroke-width:1.4}
.fp-swing{fill:none;stroke:${INK};stroke-width:0.9}
.fp-window{fill:var(--plan-bg,#fff);stroke:${INK};stroke-width:1}
.fp-pane{stroke:${INK};stroke-width:1}
.fp-label{font:600 9px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;fill:${INK};text-anchor:middle}
.fp-sub{font:8px/1 -apple-system,Helvetica,Arial,sans-serif;fill:${INK};opacity:.65;text-anchor:middle}
.fp-mini{font:600 7px/1 -apple-system,Helvetica,Arial,sans-serif;fill:${INK};text-anchor:middle}
.fp-cap{font:600 8.5px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.1em;fill:${INK};opacity:.7;text-anchor:middle}
</style>
<path d="${outline}" class="fp-out"/>
<clipPath id="clip-${l.id}"><path d="${outline}"/></clipPath>
<g clip-path="url(#clip-${l.id})">${body}</g>
<path d="${outline}" fill="none" stroke="${INK}" stroke-width="8"/>
<text x="${W / 2}" y="${H + pad + 8}" class="fp-cap">${caption}</text>
</svg>`;
	};
})();
