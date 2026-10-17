<script lang="ts">
	import { deriveAgentMap, type MapNode } from '#lib/client/agent-map.ts';
	import { live } from '#lib/client/run.svelte.ts';
	import type { ConversationState } from '#lib/server/store.ts';

	let {
		conversation: cs,
		onopen
	}: { conversation: ConversationState; onopen: (id: string) => void } = $props();

	const map = $derived(
		deriveAgentMap(cs, live.cid === cs.conversation.id && live.running ? live : null)
	);

	// Layout, in SVG user units.
	const COL_W = 116;
	const LANE_H = 80;
	const PAD_L = 64;
	const PAD_R = 120;
	const HEAD = 44;
	const SUB = 0.55;
	const BEND = 34;

	const rowOf = $derived(new Map(map.lanes.map((l) => [l.id, l.row])));
	const colorOf = $derived(new Map(map.lanes.map((l) => [l.id, l.color])));
	const nodeRow = (n: MapNode) => {
		const r = rowOf.get(n.lane) ?? 0;
		return r + Math.sign(r) * n.sub * SUB;
	};
	const rows = $derived(map.nodes.map(nodeRow));
	const minRow = $derived(Math.min(0, ...rows));
	const maxRow = $derived(Math.max(0, ...rows));
	const nx = (x: number) => PAD_L + x * COL_W;
	const ny = (row: number) => HEAD + 46 + (row - minRow) * LANE_H;
	const width = $derived(PAD_L + Math.max(map.width - 1, 0) * COL_W + PAD_R);
	const height = $derived(ny(maxRow) + 56);
	const byId = $derived(new Map(map.nodes.map((n) => [n.id, n])));

	// The map scrolls sideways along its timeline but never vertically: it scales down to fit
	// the panel's height (never up). The box is measured outside the scroller, and room for a
	// horizontal scrollbar and the bottom padding is reserved, so the scale can't oscillate as
	// the scrollbar comes and goes.
	let boxHeight = $state(0);
	const RESERVED = 32;
	const scale = $derived(boxHeight > RESERVED ? Math.min(1, (boxHeight - RESERVED) / height) : 1);

	function edgePath(fromId: string, toId: string) {
		const a = byId.get(fromId);
		const b = byId.get(toId);
		if (!a || !b) return '';
		const [ax, ay, bx, by] = [nx(a.x), ny(nodeRow(a)), nx(b.x), ny(nodeRow(b))];
		if (ay === by) return `M${ax} ${ay}H${bx}`;
		// Subway-map corners: a vertical run, one 45° bend of at most BEND, then horizontal.
		const s = Math.sign(by - ay);
		const d = Math.min(BEND, Math.abs(by - ay), Math.max(bx - ax, 0));
		// Into the trunk: along the branch, bend, then down/up into the node. Out of it: the reverse.
		return b.lane === 'trunk'
			? `M${ax} ${ay}H${bx - d}L${bx} ${ay + s * d}V${by}`
			: `M${ax} ${ay}V${by - s * d}L${ax + d} ${by}H${bx}`;
	}

	// Where each lane's label goes: just before its first node.
	const laneStarts = $derived(
		map.lanes.map((l) => {
			const first = map.nodes.find((n) => n.lane === l.id && n.sub === 0);
			return { lane: l, x: first ? first.x : 0 };
		})
	);
	const agents = $derived(map.lanes.filter((l) => l.id !== 'user').length);
	const subCalls = $derived(
		map.nodes.filter((n) => n.lane !== 'trunk' && n.lane !== 'user').length
	);
	const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

	function activate(n: MapNode) {
		if (n.artifactId) onopen(n.artifactId);
	}
</script>

<div data-testid="agent-map" class="am flex h-full flex-col bg-white dark:bg-zinc-950">
	<header data-testid="agent-map-header" class="px-5 pt-4 pb-3">
		<div
			class="flex justify-between text-[10px] font-medium tracking-[0.2em] text-zinc-400 uppercase"
		>
			<span>Recursive agents / System map</span>
			<span>Plate 01 / 01</span>
		</div>
		<h2
			data-testid="agent-map-title"
			class="mt-1.5 text-2xl font-black tracking-tight text-zinc-950 dark:text-white"
		>
			AGENT MULTIVERSE
		</h2>
		<p class="text-xs text-zinc-500">
			One goal produces parallel futures. Successful work survives; bad paths terminate.
		</p>
		<div
			class="mt-2.5 flex items-center gap-2 border-t border-zinc-200 pt-2.5 dark:border-zinc-800"
		>
			<span
				data-testid="agent-map-summary"
				class="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase dark:border-zinc-700"
			>
				{agents} lane{agents === 1 ? '' : 's'} · {subCalls} branch{subCalls === 1 ? '' : 'es'} · ${cs.usage.costUsd.toFixed(
					4
				)}
			</span>
			{#if map.live}
				<span
					data-testid="agent-map-live"
					class="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-emerald-700 uppercase dark:text-emerald-400"
				>
					<span class="size-1.5 animate-pulse rounded-full bg-emerald-600"></span>Live
				</span>
			{/if}
		</div>
	</header>

	{#if !map.nodes.length}
		<p data-testid="agent-map-empty" class="px-5 py-10 text-center text-sm text-zinc-500">
			The map grows as the agent plans, delegates and checks its work.
		</p>
	{:else}
		<div class="min-h-0 flex-1" bind:clientHeight={boxHeight}>
			<div
				data-testid="agent-map-scroll"
				class="h-full overflow-x-auto overflow-y-hidden px-2 pb-4"
			>
				<svg
					data-testid="agent-map-svg"
					width={width * scale}
					height={height * scale}
					viewBox="0 0 {width} {height}"
					class="block font-sans"
					role="img"
					aria-label="Agent map"
				>
					{#each map.columns as c, i (i)}
						<g data-testid="agent-map-column">
							<line
								x1={nx(c.x) - COL_W / 2 + 8}
								x2={nx(c.x) - COL_W / 2 + 8}
								y1={HEAD - 8}
								y2={height - 8}
								class="am-guide"
							/>
							<text x={nx(c.x) - COL_W / 2 + 14} y={HEAD - 14} class="am-col">{c.column}</text>
						</g>
					{/each}

					{#each map.edges as e, i (i)}
						<path
							data-testid="agent-map-edge"
							d={edgePath(e.from, e.to)}
							class="am-edge"
							style="stroke: var(--am-{e.color})"
						/>
					{/each}

					{#each laneStarts as s (s.lane.id)}
						{@const y = ny(s.lane.row)}
						{@const x = s.lane.id === 'trunk' ? nx(0) - 14 : nx(s.x) - 14}
						<g data-testid="agent-map-lane">
							<text
								data-testid="agent-map-lane-label"
								{x}
								y={y - 30}
								class="am-lane"
								style="fill: var(--am-{s.lane.color})">{s.lane.label}</text
							>
							<text {x} y={y - 17} class="am-caption">{clip(s.lane.caption, 34)}</text>
						</g>
					{/each}

					{#snippet nodeBody(n: MapNode)}
						{@const x = nx(n.x)}
						{@const y = ny(nodeRow(n))}
						{@const c = `var(--am-${colorOf.get(n.lane) ?? 'other'})`}
						<title>{n.label}{n.caption ? ` · ${n.caption}` : ''}</title>
						{#if n.shape === 'check'}
							<circle cx={x} cy={y} r="10" style="fill: {c}" />
							<path d="M{x - 4.5} {y}l3 3l6 -6.5" class="am-tick" stroke-width="2.4" fill="none" />
						{:else if n.shape === 'x'}
							<path
								d="M{x - 7} {y - 7}l14 14M{x + 7} {y - 7}l-14 14"
								class="am-x"
								stroke-width="3.5"
							/>
						{:else if n.shape === 'live'}
							<circle cx={x} cy={y} r="11" style="fill: {c}" opacity="0.25">
								<animate attributeName="r" values="7;15;7" dur="1.6s" repeatCount="indefinite" />
								<animate
									attributeName="opacity"
									values="0.45;0;0.45"
									dur="1.6s"
									repeatCount="indefinite"
								/>
							</circle>
							<circle cx={x} cy={y} r="6" style="fill: {c}" />
						{:else if n.shape === 'dot'}
							<circle cx={x} cy={y} r="5" style="fill: {c}" />
						{:else}
							<circle cx={x} cy={y} r="7" class="am-hollow" stroke-width="3" style="stroke: {c}" />
						{/if}
						<text
							data-testid="agent-map-node-label"
							{x}
							y={y + 25}
							text-anchor="middle"
							class="am-label {n.shape === 'x' ? 'am-fail' : ''}">{clip(n.label, 20)}</text
						>
						{#if n.caption}
							<text {x} y={y + 38} text-anchor="middle" class="am-caption"
								>{clip(n.caption, 24)}</text
							>
						{/if}
					{/snippet}

					{#each map.nodes as n (n.id)}
						{#if n.artifactId}
							<g
								data-testid="agent-map-node"
								class="am-click"
								role="button"
								tabindex="0"
								aria-label="Open {n.label}"
								onclick={() => activate(n)}
								onkeydown={(ev) => {
									if (ev.key === 'Enter' || ev.key === ' ') {
										ev.preventDefault();
										activate(n);
									}
								}}>{@render nodeBody(n)}</g
							>
						{:else}
							<g data-testid="agent-map-node">{@render nodeBody(n)}</g>
						{/if}
					{/each}
				</svg>
			</div>
		</div>
	{/if}
</div>

<style>
	.am {
		--am-trunk: #16a34a;
		--am-builder: #2563eb;
		--am-patch: #7c3aed;
		--am-critic: #059669;
		--am-revised: #ea580c;
		--am-research: #9333ea;
		--am-user: #71717a;
		--am-other: #ca8a04;
		--am-fail: #dc2626;
		--am-text: #18181b;
		--am-muted: #71717a;
		--am-faint: #e4e4e7;
		--am-bg: #ffffff;
	}
	@media (prefers-color-scheme: dark) {
		.am {
			--am-trunk: #4ade80;
			--am-builder: #60a5fa;
			--am-patch: #a78bfa;
			--am-critic: #34d399;
			--am-revised: #fb923c;
			--am-research: #c084fc;
			--am-user: #a1a1aa;
			--am-other: #facc15;
			--am-fail: #f87171;
			--am-text: #f4f4f5;
			--am-muted: #a1a1aa;
			--am-faint: #3f3f46;
			--am-bg: #09090b;
		}
	}
	.am-edge {
		fill: none;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.am-guide {
		stroke: var(--am-faint);
		stroke-width: 1;
		stroke-dasharray: 3 6;
	}
	.am-col {
		fill: var(--am-muted);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.2em;
	}
	.am-lane {
		font-size: 12px;
		font-weight: 700;
	}
	.am-label {
		fill: var(--am-text);
		font-size: 11px;
		font-weight: 600;
	}
	.am-caption {
		fill: var(--am-muted);
		font-size: 10px;
	}
	.am-fail {
		fill: var(--am-fail);
	}
	.am-x {
		stroke: var(--am-fail);
		stroke-linecap: round;
	}
	.am-hollow {
		fill: var(--am-bg);
	}
	.am-tick {
		stroke: var(--am-bg);
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.am-click {
		cursor: pointer;
	}
	.am-click:hover circle,
	.am-click:focus-visible circle {
		filter: brightness(1.15);
		stroke-width: 4;
	}
	.am-click:focus {
		outline: none;
	}
</style>
