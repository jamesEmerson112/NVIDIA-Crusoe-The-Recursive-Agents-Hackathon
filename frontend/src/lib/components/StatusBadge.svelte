<script lang="ts">
	import type { ArtifactStatus } from '#lib/types.ts';

	let { status }: { status: ArtifactStatus } = $props();
	const styles: Record<ArtifactStatus, [string, string]> = {
		ready: ['Up to date', 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'],
		awaiting_input: ['Needs your input', 'bg-sky-600/10 text-sky-800 dark:text-sky-300'],
		stale: ['Out of date', 'bg-amber-500/15 text-amber-800 dark:text-amber-300'],
		updating: ['Updating…', 'bg-violet-600/10 text-violet-800 dark:text-violet-300 animate-pulse']
	};
</script>

<span class="rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap {styles[status][1]}">{styles[status][0]}</span>
