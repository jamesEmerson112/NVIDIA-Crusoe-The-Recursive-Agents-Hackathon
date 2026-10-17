# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Entry for the Crusoe × Cerebral Valley **Recursive Agents Hackathon** (Sat Oct 17, 2026, San Francisco). Theme: a team of agents you can walk away from — agents that take a goal, plan, spawn and delegate to sub-agents, communicate, check their own progress, recover from failures, and keep running. Everything is built on **Crusoe Managed Inference** (OpenAI-compatible serverless API).

There is no application code yet, so no build, lint, or test commands exist. Add them here once a stack is chosen.

## Source of truth: `docs/crusoe-agent-docs.md`

Read this file before writing any inference code. It is written as a skill file (refreshed Oct 13, 2026) and explicitly overrides training data: model IDs, prices, endpoints, and API behavior from memory are stale. If something is not in that doc (event rules, judging, schedule, credits, submission — see §14), say so instead of guessing. When the doc and `GET /v1/models` disagree, `/v1/models` wins.

## Gotchas that break code (section numbers refer to the doc)

- **Base URL** is `https://api.inference.crusoecloud.com/v1`. Old hostnames (`api.crusoe.ai`, `managed-inference-api-proxy.crusoecloud.com`) cause 404/429. §3.1, §3.5
- **Model IDs are exact and case-sensitive**, and Crusoe's web pages often spell them differently from the API (`Deepseek-V4-Flash` vs `DeepSeek`, `zai-org/` vs `zai/`, `Qwen/` vs `qwen/`). Copy `id` from `GET /v1/models`; a wrong ID returns `404 model_not_found`. §4.1, §5
- **Deprecated models still appear in official examples** (e.g. `meta-llama/Llama-3.3-70B-Instruct`, Kimi K2.6, GLM-5.1/5.2). Don't use them. §4.3
- **API keys can contain `$`**: export with single quotes (`export CRUSOE_API_KEY='...'`); double quotes silently corrupt the key → 401/403. §3.3
- **Rate limits are per project *per model***, resetting each minute: 30 RPM / 500K TPM without a payment method, 600 RPM / 2M TPM with one. Every agent-loop turn is a request, so parallel sub-agents hit 30 RPM fast. Spread roles across different models, throttle on the `x-ratelimit-remaining-*` headers, and retry 429/503 with jittered exponential backoff. §6
- **Reasoning models spend `max_tokens` on thinking.** Use ≥1024 and check `finish_reason == "length"` when `content` is empty. Read both `reasoning_content` and `reasoning`. Toggle thinking via `extra_body={"chat_template_kwargs": {...}}`; DeepSeek's native `"thinking": {"type": "enabled"}` returns 403. Toggles differ per model — check `supported_parameters` in `/v1/models`. §4.6, §7.2
- **Tool calling**: append the assistant message containing `tool_calls` *before* the `role: "tool"` results, or you get a 400. §7.3
- **Image input** is per model; sending images to a text-only model may be silently ignored. Check `architecture.modality == "multimodal"`. §7.1
- **Prefix caching** requires a byte-identical prefix (system prompt, tool schema order, JSON key order). Keep history append-only and put changing content last; verify with `usage.prompt_tokens_details.cached_tokens`. §8
- Troubleshooting table by status code/symptom: §12.

## Model selection (§4.4)

- Cheap, high-frequency roles (sub-agents, routers, classifiers): `nvidia/nemotron-3.5-lightning-30b-a3b`, `deepseek-ai/Deepseek-V4-Flash`, `nvidia/Nemotron-3-Nano-30B-A3B`.
- Long, input-heavy loops with large repeated prefixes: `deepseek-ai/DeepSeek-V4.1-Flash` (lowest cached-input price).
- Planner / hardest reasoning and coding: `deepseek-ai/DeepSeek-V4-Pro`, GLM-5.3; collaborative agents and tool use: `nvidia/Nemotron-3-Super-120B-A12B`.
- Most reliable tool calling: `openai/gpt-oss-120b`.

Several of these IDs are marked "confirm" in the doc — verify against `/v1/models` before hardcoding. Wiring for OpenCode, Pi, and OpenClaw harnesses is in §9.1; PromQL metrics in §10.
