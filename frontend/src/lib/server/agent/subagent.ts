import { CRUSOE_FAST_MODEL } from '$app/env/private';
import { chat, hasApiKey } from '../crusoe';
import * as store from '../store';
import { mockChat } from './mock';

export const SUBAGENT_PROMPT = `You revise one artifact inside a larger piece of work.
You get an instruction, the artifact's upstream inputs (form answers or documents it was built from), and its current content.
Return ONLY the full revised content, in the same format as the current content (markdown or HTML). No preamble, no code fences, no commentary.
Change what the instruction and the new inputs require; keep everything else as it was.`;

/** A cheap one-shot sub-agent on the fast model. Callers may run several in parallel. */
export async function runQuickEdit(
	conversationId: string,
	artifactId: string,
	instruction: string,
	signal?: AbortSignal
) {
	const artifact = await store.getArtifact(conversationId, artifactId);
	if (!artifact) throw new Error(`No artifact ${artifactId}`);
	const upstream = await Promise.all(
		(await store.upstreamOf(artifactId)).map((id) => store.getArtifact(conversationId, id))
	);
	const inputs = upstream
		.filter((u) => u !== undefined)
		.map((u) =>
			u.kind === 'form'
				? `### ${u.title} (${u.id}, form answers)\n${JSON.stringify(u.data ?? {}, null, 2)}`
				: `### ${u.title} (${u.id}, ${u.kind})\n${u.content}`
		)
		.join('\n\n');

	const model = CRUSOE_FAST_MODEL;
	const result = await (hasApiKey() ? chat : mockChat)({
		model,
		messages: [
			{ role: 'system', content: SUBAGENT_PROMPT },
			{
				role: 'user',
				content: `Instruction: ${instruction}\n\nUpstream inputs:\n${inputs || '(none)'}\n\nCurrent artifact "${artifact.title}" (${artifact.kind}):\n${artifact.content}`
			}
		],
		maxTokens: 8192,
		signal
	});
	const content = stripFences(result.content);
	if (!content) throw new Error(`Empty output (finish_reason ${result.finishReason})`);

	await store.recordUsage(conversationId, model, 'subagent', result.usage);
	const { version } = await store.addVersion(
		conversationId,
		artifactId,
		{ content, note: `Sub-agent: ${instruction}` },
		{
			author: 'subagent',
			model,
			costUsd: result.usage.costUsd,
			durationMs: result.usage.durationMs
		}
	);
	return { version, costUsd: result.usage.costUsd };
}

function stripFences(text: string) {
	const t = text.trim();
	const m = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
	return m ? m[1] : t;
}
