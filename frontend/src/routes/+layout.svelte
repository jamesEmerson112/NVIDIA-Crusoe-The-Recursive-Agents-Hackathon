<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { live } from '#lib/client/run.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const when = (d: Date) => {
		const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
		return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
	};

	async function remove(id: string) {
		if (!confirm('Delete this conversation and its artifacts?')) return;
		await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
		await invalidate('app:conversations');
		if (page.params.id === id) goto('/');
	}

	// Collapsed shows a narrow icon rail to free width for the chat; remembered per browser.
	const COLLAPSED_KEY = 'sidebar-collapsed';
	let collapsed = $state(false);

	$effect(() => {
		try {
			collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
		} catch {
			// Storage blocked (private mode): keep the default.
		}
	});

	function toggleSidebar() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
		} catch {
			// Not persisted; the toggle still works for this page view.
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Workbench</title>
</svelte:head>

<div
	data-testid="app-root"
	class="flex h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
>
	<nav
		data-testid="sidebar"
		data-state={collapsed ? 'collapsed' : 'expanded'}
		class="flex shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-50 transition-[width] duration-200 max-md:hidden dark:border-zinc-800 dark:bg-zinc-900/50 {collapsed
			? 'w-14'
			: 'w-64'}"
	>
		<div class="flex p-2 {collapsed ? 'justify-center' : 'justify-end'}">
			<button
				data-testid="sidebar-toggle"
				class="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				aria-expanded={!collapsed}
				title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				onclick={toggleSidebar}
			>
				<svg
					viewBox="0 0 24 24"
					class="size-5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
				>
					<rect x="3" y="4" width="18" height="16" rx="2.5" />
					<path d="M9 4v16" />
				</svg>
			</button>
		</div>
		{#if collapsed}
			<div class="flex flex-col items-center gap-1 px-2">
				<a
					data-testid="sidebar-new"
					href="/"
					class="grid size-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
					aria-label="New conversation"
					title="New conversation"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
					>
						<path d="M12 5v14M5 12h14" stroke-linecap="round" />
					</svg>
				</a>
				<a
					data-testid="sidebar-library"
					href="/library"
					class="grid size-9 place-items-center rounded-lg {page.url.pathname === '/library'
						? 'bg-zinc-200 dark:bg-zinc-800'
						: 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800'}"
					aria-label="Library"
					title="Library"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
					>
						<path
							d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 4.5l3.5 1-3.5 14.5-3-1z"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			</div>
		{:else}
			<div class="px-3 pb-3">
				<a
					data-testid="sidebar-new"
					href="/"
					class="block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
					>+ New conversation</a
				>
				<a
					data-testid="sidebar-library"
					href="/library"
					class="mt-1 block rounded-lg px-3 py-2 text-sm {page.url.pathname === '/library'
						? 'bg-zinc-200 dark:bg-zinc-800'
						: 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60'}"
					>Library</a
				>
				<p class="mt-3 px-3 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
					Conversations
				</p>
			</div>
			<ul
				data-testid="sidebar-conversations"
				class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
			>
				{#each data.conversations as c (c.id)}
					<li data-testid="sidebar-item" class="group relative">
						<a
							data-testid="sidebar-conversation"
							href="/c/{c.id}"
							class="block rounded-lg px-3 py-2 pr-8 text-sm {page.params.id === c.id
								? 'bg-zinc-200 dark:bg-zinc-800'
								: 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60'}"
						>
							<span class="block truncate">{c.title}</span>
							<span class="flex items-center gap-1.5 text-[11px] text-zinc-500">
								{#if live.running && live.cid === c.id}<span
										data-testid="sidebar-working"
										class="size-1.5 animate-pulse rounded-full bg-emerald-600"
									></span>Working ·{/if}
								{when(c.updatedAt)}
							</span>
						</a>
						<button
							data-testid="sidebar-delete"
							class="absolute top-2 right-2 hidden rounded px-1 text-zinc-400 group-hover:block hover:text-rose-600"
							aria-label="Delete conversation"
							onclick={() => remove(c.id)}>✕</button
						>
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.mock && !collapsed}
			<p
				data-testid="sidebar-mock-notice"
				class="m-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
			>
				Mock agent: set <code>CRUSOE_API_KEY</code> in <code>frontend/.env</code> to use Crusoe.
			</p>
		{/if}
	</nav>
	<main data-testid="app-main" class="flex min-w-0 flex-1">
		{@render children()}
	</main>
</div>
