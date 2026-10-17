// A scripted stand-in for the model, used when CRUSOE_API_KEY is unset. It drives the same
// tool executors as the real agent, so the UI, storage and edit flow can be built and demoed offline.
import type { ChatRequest, ChatResult } from '../crusoe';
import type { ToolCall } from '#lib/types.ts';
import { SUBAGENT_PROMPT } from './subagent';

let callSeq = 0;
const call = (name: string, args: unknown): ToolCall => ({
	id: `mock_${++callSeq}`,
	type: 'function',
	function: { name, arguments: JSON.stringify(args) }
});

export async function mockChat(req: ChatRequest): Promise<ChatResult> {
	const started = Date.now();
	const { content, toolCalls } = script(req);
	for (const word of content.split(/(?<= )/)) {
		await new Promise((r) => setTimeout(r, 15));
		req.onDelta?.(word);
	}
	const durationMs = Date.now() - started + 400;
	return {
		content,
		reasoning: '',
		toolCalls,
		finishReason: toolCalls.length ? 'tool_calls' : 'stop',
		usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: 0.0004, durationMs }
	};
}

function script(req: ChatRequest): { content: string; toolCalls: ToolCall[] } {
	const msgs = req.messages;
	const last = msgs[msgs.length - 1];
	const text = (last.content as string) ?? '';

	if (msgs[0].content === SUBAGENT_PROMPT) {
		const answers = JSON.parse(text.match(/form answers\)\n(\{[\s\S]*?\n\})/)?.[1] ?? '{}');
		return { content: brief(answers), toolCalls: [] };
	}

	if (last.role === 'tool') {
		const lastUser = [...msgs].reverse().find((m) => m.role === 'user')?.content as string;
		if (lastUser.startsWith('[Form submitted]'))
			return { content: 'I drafted **Project brief** from your answers. Change any answer in the form and I will update it.', toolCalls: [] };
		if (lastUser.startsWith('[Edit]'))
			return { content: 'That was a small change, so a fast sub-agent patched the brief. Open it to see the new version.', toolCalls: [] };
		return { content: 'I set up a plan and a short form. Fill it in and I will take it from there.', toolCalls: [] };
	}

	if (text.startsWith('[Form submitted]')) {
		const formId = text.match(/\((art_\w+)\)/)?.[1];
		const answers = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '{}');
		return {
			content: '',
			toolCalls: [
				call('update_step', { step: 1, status: 'done', summary: 'Collected the brief' }),
				call('create_artifact', { title: 'Project brief', kind: 'document', step: 2, content: brief(answers), depends_on: [formId] }),
				call('update_step', { step: 2, status: 'done', summary: 'Drafted the brief' }),
				call('update_step', { step: 3, status: 'active' })
			]
		};
	}

	if (text.startsWith('[Edit]')) {
		const stale = [...text.matchAll(/^- (art_\w+)/gm)].map((m) => m[1]);
		if (!stale.length) return { content: 'Noted. Nothing else depends on that, so there is nothing to redo.', toolCalls: [] };
		return {
			content: '',
			toolCalls: stale.map((id) => call('quick_edit', { artifact_id: id, instruction: 'Reflect the updated form answers.' }))
		};
	}

	if (!msgs.some((m) => m.role === 'assistant')) {
		return {
			content: '',
			toolCalls: [
				call('set_plan', {
					steps: [
						{ title: 'Gather requirements', status: 'active' },
						{ title: 'Draft the brief' },
						{ title: 'Review and refine' }
					]
				}),
				call('create_form', {
					title: 'Project details',
					step: 1,
					description: 'A few details so the brief fits what you need.',
					fields: [
						{ name: 'goal', label: 'What are you trying to achieve?', type: 'textarea', required: true, default: text },
						{ name: 'audience', label: 'Who is it for?', type: 'text' },
						{ name: 'tone', label: 'Tone', type: 'radio', options: ['Casual', 'Professional', 'Playful'], default: 'Professional' },
						{ name: 'budget', label: 'Budget (USD)', type: 'number' },
						{ name: 'deadline', label: 'Deadline', type: 'date' }
					],
					submit_label: 'Draft the brief'
				})
			]
		};
	}

	return {
		content:
			'(Mock agent: no CRUSOE_API_KEY is set, so I can only run the scripted demo. Add a key to frontend/.env for the real agent.)',
		toolCalls: []
	};
}

function brief(a: Record<string, unknown>) {
	return `# Project brief

**Goal:** ${a.goal || '_not given_'}

| | |
|---|---|
| Audience | ${a.audience || '—'} |
| Tone | ${a.tone || '—'} |
| Budget | ${a.budget ? `$${a.budget}` : '—'} |
| Deadline | ${a.deadline || '—'} |

## Approach
1. Confirm scope against the goal and the ${a.budget ? `$${a.budget}` : 'open'} budget.
2. Produce a first draft in a ${String(a.tone || 'neutral').toLowerCase()} tone for ${a.audience || 'the intended audience'}.
3. Review${a.deadline ? ` before ${a.deadline}` : ''} and refine.
`;
}
