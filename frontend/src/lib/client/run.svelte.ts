import { invalidate } from '$app/navigation';
import type { RunEvent } from '#lib/types.ts';

export type RunBody =
	| { type: 'message'; content: string }
	| { type: 'form_submit'; artifactId: string; values: Record<string, unknown> }
	| {
			type: 'artifact_edit';
			artifactId: string;
			values?: Record<string, unknown>;
			content?: string;
			/** Forms only: replacement questions (a FormSpec). */
			spec?: import('#lib/types.ts').FormSpec;
	  }
	| { type: 'proposal_reply'; callId: string; approved: boolean };

/** Live state of the agent run in the open conversation (one at a time per tab). */
export const live = $state({
	cid: null as string | null,
	running: false,
	text: '',
	reasoning: '',
	status: '',
	activity: [] as string[],
	error: ''
});

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function refresh() {
	clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		invalidate('app:conversation');
		invalidate('app:conversations');
	}, 120);
}

export async function startRun(cid: string, body: RunBody) {
	Object.assign(live, {
		cid,
		running: true,
		text: '',
		reasoning: '',
		status: 'Starting',
		activity: [],
		error: ''
	});
	try {
		const res = await fetch(`/api/conversations/${cid}/run`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok || !res.body) {
			live.error =
				(await res.json().catch(() => null))?.message ?? `Request failed (${res.status})`;
			return;
		}
		const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += value;
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) if (line.trim()) apply(JSON.parse(line) as RunEvent);
		}
	} catch (err) {
		live.error = (err as Error).message;
	} finally {
		live.running = false;
		live.status = '';
		refresh();
	}
}

function apply(e: RunEvent) {
	switch (e.type) {
		case 'status':
			// A new model turn: the previous turn's text is now a stored message.
			live.status = e.text;
			live.text = '';
			live.reasoning = '';
			break;
		case 'delta':
			live.text += e.text;
			break;
		case 'reasoning':
			live.reasoning += e.text;
			break;
		case 'tool':
			live.activity = [...live.activity.slice(-5), e.summary];
			break;
		case 'changed':
			live.text = '';
			refresh();
			break;
		case 'error':
			live.error = e.message;
			break;
	}
}

export async function cancelRun(cid: string) {
	await fetch(`/api/conversations/${cid}/cancel`, { method: 'POST' });
}

/** Save new questions on a form that hasn't been answered yet (no agent run). */
export async function saveQuestions(
	cid: string,
	artifactId: string,
	spec: import('#lib/types.ts').FormSpec,
	{ refresh = true } = {}
) {
	const res = await fetch(`/api/conversations/${cid}/artifacts/${artifactId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ spec })
	});
	if (!res.ok)
		throw new Error((await res.json().catch(() => null))?.message ?? `Save failed (${res.status})`);
	if (refresh) await invalidate('app:conversation');
}
