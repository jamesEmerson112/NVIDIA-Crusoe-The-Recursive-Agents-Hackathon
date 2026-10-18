<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cancelRun, live, startRun, type RunBody } from '#lib/client/run.svelte.ts';
	import type { ConversationState } from '#lib/server/store.ts';
	import type { MessageMeta } from '#lib/types.ts';
	import AgentMap from './AgentMap.svelte';
	import ArtifactCard from './ArtifactCard.svelte';
	import ArtifactView from './ArtifactView.svelte';
	import Composer from './Composer.svelte';
	import Markdown from './Markdown.svelte';
	import ProcessPanel from './ProcessPanel.svelte';
	import ProposalCard from './ProposalCard.svelte';
	import RunLog from './RunLog.svelte';
	import BlueprintEmbed from './BlueprintEmbed.svelte';
	import InlineInput from './InlineInput.svelte';

	let { conversation: cs }: { conversation: ConversationState } = $props();

	const cid = $derived(cs.conversation.id);
	const busy = $derived(live.running && live.cid === cid);
	const openId = $derived(page.url.searchParams.get('a'));
	const opened = $derived(cs.artifacts.find((a) => a.id === openId));
	const titles = $derived(new Map(cs.artifacts.map((a) => [a.id, a.title])));
	const replies = $derived(
		new Map(
			cs.messages.flatMap((m) => {
				const meta = m.meta as MessageMeta | null;
				return meta?.kind === 'proposal_reply' ? [[meta.callId, meta.approved] as const] : [];
			})
		)
	);
	const byId = $derived(new Map(cs.artifacts.map((a) => [a.id, a])));
	let panelOpen = $state(true);
	// Right panel tab; `?panel=map` deep-links the agent map, `?panel=log` the run log.
	const panelParam = page.url.searchParams.get('panel');
	let panelTab = $state<'process' | 'map' | 'log'>(
		panelParam === 'map' || panelParam === 'log' ? panelParam : 'process'
	);
	const mapWide = $derived(panelTab !== 'process' && !opened);

	// Right panel width: drag its left edge to resize (double-click resets); remembered per browser.
	const PANEL_DEFAULT = 480;
	const PANEL_MIN = 360;
	let panelWidth = $state(PANEL_DEFAULT);
	let viewportWidth = $state(1440);
	const clampWidth = (w: number) =>
		Math.round(Math.min(Math.max(w, PANEL_MIN), viewportWidth * 0.75));
	const asideWidth = $derived.by(() => {
		if (viewportWidth < 1280) return mapWide ? viewportWidth : Math.min(panelWidth, viewportWidth);
		const w = clampWidth(panelWidth);
		// The map and run log want room: at least min(880px, 58vw) when shown.
		return mapWide ? Math.max(w, Math.min(880, viewportWidth * 0.58)) : w;
	});
	$effect(() => {
		try {
			const saved = Number(localStorage.getItem('workbench.panelWidth'));
			if (saved) panelWidth = saved;
		} catch {
			// Storage unavailable: keep the default.
		}
	});
	function savePanelWidth() {
		try {
			localStorage.setItem('workbench.panelWidth', String(panelWidth));
		} catch {
			// Not persisted; the width still applies for this page.
		}
	}
	function startResize(e: PointerEvent) {
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		const startW = asideWidth;
		document.body.style.userSelect = 'none';
		const move = (ev: PointerEvent) => (panelWidth = clampWidth(startW + (startX - ev.clientX)));
		const up = () => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', up);
			handle.removeEventListener('pointercancel', up);
			document.body.style.userSelect = '';
			savePanelWidth();
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', up);
	}
	function resizeByKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 96 : 24;
		if (e.key === 'ArrowLeft') panelWidth = clampWidth(asideWidth + step);
		else if (e.key === 'ArrowRight') panelWidth = clampWidth(asideWidth - step);
		else return;
		e.preventDefault();
		savePanelWidth();
	}
	// Below xl the panel overlays the chat, so start with it closed there.
	$effect(() => {
		if (window.innerWidth < 1280) panelOpen = false;
	});

	// Tool results only carry the call id; recover which tool produced them.
	const toolNames = $derived(
		new Map(
			cs.messages.flatMap((m) => (m.toolCalls ?? []).map((c) => [c.id, c.function.name] as const))
		)
	);
	const verb: Record<string, string> = {
		create_form: 'Form',
		create_artifact: 'Created',
		update_artifact: 'Updated',
		quick_edit: 'Updated by sub-agent'
	};

	// Show each pending form inline once, at the point the agent asked for it.
	// Forms and widgets stay embedded where the agent first asked for them, answered or not.
	// Forms and widgets stay embedded where the agent first asked; a blueprint is embedded at its
	// latest mention (showing it again moves the 3D view down to the newest turn).
	const inlineInputs = $derived.by(() => {
		const first = new Map<string, string>();
		const last = new Map<string, string>();
		for (const m of cs.messages) {
			const meta = m.meta as MessageMeta | null;
			if (m.role !== 'tool' || meta?.kind !== 'artifact') continue;
			if (!first.has(meta.artifactId)) first.set(meta.artifactId, m.id);
			last.set(meta.artifactId, m.id);
		}
		const out = new Set<string>();
		for (const [artifactId, messageId] of first) {
			const kind = byId.get(artifactId)?.kind;
			if (kind === 'form' || kind === 'widget') out.add(messageId);
			if (kind === 'blueprint') out.add(last.get(artifactId)!);
		}
		return out;
	});

	function open(id: string | null) {
		const params = new URLSearchParams(page.url.search);
		if (id) params.set('a', id);
		else params.delete('a');
		panelOpen = true;
		const query = params.toString();
		goto(page.url.pathname + (query ? `?${query}` : ''), { reset: false });
	}

	const run = (body: RunBody) => startRun(cid, body);

	let scroller: HTMLElement | undefined = $state();
	$effect(() => {
		// Follow new content while the agent works.
		void cs.messages.length;
		void live.text;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	});
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div class="relative flex h-full min-w-0 flex-1">
	<section class="flex min-w-0 flex-1 flex-col">
		<header class="flex items-center gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
			<h1 data-testid="workspace-title" class="min-w-0 flex-1 truncate text-sm font-semibold">
				{cs.conversation.title}
			</h1>
			<button
				data-testid="workspace-open-map"
				class="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
				onclick={() => {
					panelTab = 'map';
					panelOpen = true;
					if (opened) open(null);
				}}>Agent map</button
			>
			<button
				data-testid="workspace-toggle-process"
				class="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
				onclick={() => (panelOpen = !panelOpen)}
				>{panelOpen ? 'Hide process' : 'Show process'}</button
			>
		</header>

		<div data-testid="workspace-chat" class="min-h-0 flex-1 overflow-y-auto" bind:this={scroller}>
			<div class="mx-auto max-w-3xl space-y-5 px-5 py-6">
				{#each cs.messages as m (m.id)}
					{@const meta = m.meta as MessageMeta | null}
					{#if m.role === 'user' && meta?.kind === 'form_submit'}
						{@const a = byId.get(meta.artifactId)}
						<div data-testid="workspace-message-form-submit" class="flex justify-end">
							<button
								data-testid="workspace-form-submit-open"
								class="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
								onclick={() => open(meta.artifactId)}
							>
								✓ Answered {a?.title ?? 'form'}
							</button>
						</div>
					{:else if m.role === 'user' && meta?.kind === 'artifact_edit'}
						{@const a = byId.get(meta.artifactId)}
						<div data-testid="workspace-message-artifact-edit" class="flex justify-end">
							<button
								data-testid="workspace-artifact-edit-open"
								class="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
								onclick={() => open(meta.artifactId)}
							>
								✎ You edited {a?.title ?? 'an artifact'}{a &&
								a.kind !== 'form' &&
								a.kind !== 'widget'
									? ` (v${meta.version})`
									: ''}{meta.staleIds.length
									? ` · ${meta.staleIds.length} dependent artifact${meta.staleIds.length > 1 ? 's' : ''} out of date`
									: ''}
							</button>
						</div>
					{:else if m.role === 'user' && meta?.kind === 'check'}
						<details
							data-testid="workspace-message-check"
							class="text-xs text-violet-800 dark:text-violet-300"
						>
							<summary data-testid="workspace-check-summary" class="cursor-pointer select-none">
								↻ Self-check caught {meta.problems.length} problem{meta.problems.length > 1
									? 's'
									: ''} and sent the agent back to fix {meta.problems.length > 1 ? 'them' : 'it'}
							</summary>
							<ul class="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
								{#each meta.problems as p, i (i)}<li data-testid="workspace-check-problem">
										{p}
									</li>{/each}
							</ul>
						</details>
					{:else if m.role === 'user' && meta?.kind === 'proposal_reply'}
						<div data-testid="workspace-message-proposal-reply" class="flex justify-end">
							<span
								class="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
							>
								{meta.approved ? '✓ Approved the redo' : 'Kept the current version'}
							</span>
						</div>
					{:else if m.role === 'tool' && meta?.kind === 'proposal'}
						<ProposalCard
							proposal={meta}
							{titles}
							answer={replies.get(meta.callId)}
							{busy}
							onopen={open}
							onanswer={(approved) =>
								run({ type: 'proposal_reply', callId: meta.callId, approved })}
						/>
					{:else if m.role === 'user'}
						<div class="flex justify-end">
							<div
								data-testid="workspace-message-user"
								class="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm whitespace-pre-wrap dark:bg-zinc-800"
							>
								{m.content}
							</div>
						</div>
					{:else if m.role === 'assistant' && meta?.kind === 'error'}
						<div
							data-testid="workspace-message-error"
							class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
						>
							{m.content}
						</div>
					{:else if m.role === 'assistant' && m.content}
						<Markdown source={m.content} />
					{:else if m.role === 'tool' && meta?.kind === 'artifact'}
						{@const a = byId.get(meta.artifactId)}
						{#if a && inlineInputs.has(m.id)}
							{#if a.kind === 'blueprint'}
								<BlueprintEmbed
									id={a.id}
									{cid}
									title={a.title}
									status={a.status}
									spec={JSON.parse(
										(a.versions.find((x) => x.version === a.currentVersion) ?? a.versions[0])
											.content
									)}
								/>
							{:else}
								<InlineInput artifact={a} {cid} {busy} {run} />
							{/if}
						{:else if a}
							<ArtifactCard
								artifact={a}
								label={verb[toolNames.get(m.toolCallId ?? '') ?? ''] ?? 'Artifact'}
								onopen={() => open(a.id)}
							/>
						{/if}
					{/if}
				{/each}

				{#if busy}
					<div data-testid="workspace-live" class="space-y-2">
						{#if live.text}
							<Markdown source={live.text} />
						{/if}
						<div class="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
							<span data-testid="workspace-live-status" class="inline-flex items-center gap-1.5">
								<span class="size-1.5 animate-pulse rounded-full bg-emerald-600"></span>
								{live.status || 'Working'}{live.reasoning && !live.text ? ' (reasoning)' : ''}
							</span>
							{#each live.activity as a, i (i)}
								<span
									data-testid="workspace-live-activity"
									class="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{a}</span
								>
							{/each}
						</div>
					</div>
				{/if}
				{#if live.error && live.cid === cid && !busy}
					<p data-testid="workspace-error" class="text-sm text-rose-600">{live.error}</p>
				{/if}
			</div>
		</div>

		<div class="mx-auto w-full max-w-3xl px-5 pb-5">
			<Composer
				{busy}
				onsend={(content) => run({ type: 'message', content })}
				onstop={() => cancelRun(cid)}
			/>
		</div>
	</section>

	{#if panelOpen || opened}
		<aside
			data-testid="workspace-panel"
			class="relative shrink-0 border-l border-zinc-200 bg-zinc-50 max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-10 max-xl:shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
			style="width: {asideWidth}px"
		>
			<!-- Drag (or arrow keys) to resize; double-click resets. A focusable role=separator is the
			     ARIA pattern for a resize handle, which Svelte's a11y lint doesn't know. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				data-testid="workspace-panel-resize"
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize panel"
				aria-valuenow={asideWidth}
				tabindex="0"
				class="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize transition-colors hover:bg-emerald-500/30 focus-visible:bg-emerald-500/40 focus-visible:outline-none max-xl:hidden"
				onpointerdown={startResize}
				ondblclick={() => ((panelWidth = PANEL_DEFAULT), savePanelWidth())}
				onkeydown={resizeByKey}
			></div>
			{#if opened}
				<ArtifactView
					artifact={opened}
					all={cs.artifacts}
					{busy}
					onopen={open}
					onclose={() => open(null)}
					onedit={(edit) => run({ type: 'artifact_edit', artifactId: opened.id, ...edit })}
				/>
			{:else}
				<div class="flex h-full flex-col">
					<div
						data-testid="workspace-panel-tabs"
						class="flex gap-1 border-b border-zinc-200 px-3 pt-2 dark:border-zinc-800"
					>
						{#each [['process', 'Process'], ['map', 'Agent map'], ['log', 'Run log']] as const as [tab, label] (tab)}
							<button
								data-testid="workspace-panel-tab"
								class="-mb-px border-b-2 px-3 py-1.5 text-xs font-medium {panelTab === tab
									? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
									: 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}"
								aria-pressed={panelTab === tab}
								onclick={() => (panelTab = tab)}>{label}</button
							>
						{/each}
						<button
							data-testid="workspace-panel-close"
							class="ml-auto self-center rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
							aria-label="Hide panel"
							title="Hide panel"
							onclick={() => (panelOpen = false)}>✕</button
						>
					</div>
					<div class="min-h-0 flex-1">
						{#if panelTab === 'map'}
							<AgentMap conversation={cs} onopen={open} />
						{:else if panelTab === 'log'}
							<RunLog conversation={cs} onopen={open} />
						{:else}
							<ProcessPanel conversation={cs} onopen={open} />
						{/if}
					</div>
				</div>
			{/if}
		</aside>
	{/if}
</div>
