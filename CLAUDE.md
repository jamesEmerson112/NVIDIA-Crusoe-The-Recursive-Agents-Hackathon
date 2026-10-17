# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Entry for the Crusoe × Cerebral Valley **Recursive Agents Hackathon** (Sat Oct 17, 2026, San Francisco). Theme: a team of agents you can walk away from — agents that take a goal, plan, spawn and delegate to sub-agents, communicate, check their own progress, recover from failures, and keep running. Everything is built on **Crusoe Managed Inference** (OpenAI-compatible serverless API).

Background research on the "digital fruit fly brain", with agent-team design ideas for this project, is in `docs/research/fruit-fly-brain/` (start with `00-overview.md`).

## Frontend (`frontend/`)

Angular 22 (standalone components, zoneless, Vitest), chosen by the user: stick with Angular until told otherwise. 3D rendering uses plain `three` + `@types/three` (keep both on the same 0.x minor). `angular-three` was ruled out on 2026-10-17 because it only supports Angular <22 and three <0.183.

`src/app/three-scene/` is the three.js component. Its patterns: initialize in `afterNextRender`, check `WebGL.isWebGL2Available()` first (jsdom in unit tests has no WebGL), size the renderer from a `ResizeObserver`, and dispose everything in `DestroyRef.onDestroy`. `app.html` wraps it in `@defer` so three.js loads as a lazy chunk; without that, the initial bundle exceeds the 500 kB budget.

## Environment and commands

This is a team repo, and collaborators work through their own Claude agents, so everyone must run identical tooling:

- **Node 24.22.0** (bundles npm 11.19.1) is pinned by the root `.nvmrc`. Each Bash call is a fresh shell, so prefix Node commands with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`; nvm finds the root `.nvmrc` from any subfolder. On Windows (nvm-windows ignores `.nvmrc`), run `nvm use 24.22.0`.
- `devEngines` in `frontend/package.json` rejects any other Node or npm version, but only for `npm` commands, **not `npx`**. Always go through npm scripts.
- Install with `npm ci`. Run `npm install <pkg>` only to add a dependency, then commit `package-lock.json`. Never delete or regenerate the lockfile: it carries the native binaries for every OS.
- Dependency install scripts are denied in `allowScripts`; the current packages ship prebuilt binaries. If a new dependency genuinely needs its script, review it and run `npm install-scripts approve <pkg>`.
- Shared Claude Code permissions live in `.claude/settings.json`. Personal overrides go in `.claude/settings.local.json`, which is gitignored.

Commands, from `frontend/`:

- `npm ci`: install the exact locked dependencies
- `npm start`: dev server at http://localhost:4200
- `npm run build`: production build to `dist/frontend`
- `npm test -- --watch=false`: all unit tests; add `--include src/app/app.spec.ts` for a single spec file
- `npm run ng -- generate component <name>`: Angular CLI generators

## Source of truth: the `crusoe-recursive-agents-hackathon` skill

Invoke this project skill (`.claude/skills/crusoe-recursive-agents-hackathon/SKILL.md`) before writing any inference code. It was refreshed Oct 13, 2026 and explicitly overrides training data: model IDs, prices, endpoints, and API behavior from memory are stale. If something is not in that doc (event rules, judging, schedule, credits, submission — see §14), say so instead of guessing. When the doc and `GET /v1/models` disagree, `/v1/models` wins.

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
