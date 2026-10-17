export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

/** Line diff via longest common subsequence. Fine for artifact-sized texts (a few hundred lines). */
export function lineDiff(before: string, after: string): DiffLine[] {
	const a = before.split('\n');
	const b = after.split('\n');
	// lcs[i][j] = LCS length of a[i..] and b[j..]
	const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			out.push({ type: 'same', text: a[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			out.push({ type: 'del', text: a[i++] });
		} else {
			out.push({ type: 'add', text: b[j++] });
		}
	}
	while (i < a.length) out.push({ type: 'del', text: a[i++] });
	while (j < b.length) out.push({ type: 'add', text: b[j++] });
	return out;
}

/** Keep changed lines plus `context` unchanged lines around them; runs of hidden lines become one gap marker (null). */
export function withContext(lines: DiffLine[], context = 2): (DiffLine | null)[] {
	const keep = lines.map((l) => l.type !== 'same');
	const show = lines.map((_, i) =>
		keep.slice(Math.max(0, i - context), i + context + 1).some(Boolean)
	);
	const out: (DiffLine | null)[] = [];
	lines.forEach((l, i) => {
		if (show[i]) out.push(l);
		else if (out[out.length - 1] !== null) out.push(null);
	});
	return out;
}
