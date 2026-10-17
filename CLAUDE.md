# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Entry for the Crusoe × Cerebral Valley **Recursive Agents Hackathon** (Sat Oct 17, 2026, San Francisco). Theme: a team of agents you can walk away from — agents that take a goal, plan, spawn and delegate to sub-agents, communicate, check their own progress, recover from failures, and keep running. Everything is built on **Crusoe Managed Inference** (OpenAI-compatible serverless API).

Team research lives in `docs/research/` (start with `docs/research/README.md`). It covers building our own Obsidian-style knowledge base for agent memory, GPT-6 Astra vs Claude for Blender and 3D work, rendering San Francisco buildings in three.js, floorplan datasets and 2D-to-3D rendering, and building energy simulation. Read the relevant file before working on any of those.

## Frontend (`frontend/`)

SvelteKit 3 + Svelte 5 (runes mode forced in `vite.config.ts`), TypeScript, Tailwind 4 with `@tailwindcss/typography`, Vitest, Prettier. Switched from Angular on 2026-10-17 at the user's request. `@sveltejs/adapter-node` because agents run as long-lived server work: all Crusoe calls go through server code (`src/lib/server/`, `+server.ts`, `+page.server.ts`), never the browser, so `CRUSOE_API_KEY` stays out of the bundle.

Persistence is SQLite through Node's built-in `node:sqlite` with Drizzle ORM (schema in `src/lib/server/db/schema.ts`, database path from `DATABASE_URL` in `frontend/.env`, default `local.db`). `drizzle-orm` and `drizzle-kit` are pinned to `1.0.0-rc.4`: the `node-sqlite` driver doesn't exist in stable 0.45, and 1.0 takes `drizzle({ client })`, not `drizzle(client, { schema })`. Using `node:sqlite` avoids native builds, so install scripts can stay blocked.

Imports through `#lib/...` (Node subpath imports in `package.json`) need the file extension: `#lib/types.ts`, not `#lib/types`.

Env vars are declared in `src/env.ts` (`defineEnvVars`) and read from `$app/env/private`: `DATABASE_URL`, `CRUSOE_API_KEY` (optional: unset runs the scripted mock agent in `agent/mock.ts`, so the UI works offline), `CRUSOE_AGENT_MODEL` (default `openai/gpt-oss-120b`), `CRUSOE_FAST_MODEL` (default `deepseek-ai/Deepseek-V4-Flash`).

## Product: Workbench (in progress)

A ChatGPT-desktop-style chat where the agent also builds a **process**: a numbered plan of steps plus typed, versioned **artifacts** (forms, markdown documents, sandboxed HTML) with lineage. Users come back later and click artifacts to recall details; editing an earlier form marks everything built from it stale, and the agent either patches cheaply with parallel sub-agents or asks before an expensive redo.

- **Schema** (`src/lib/server/db/schema.ts`): `conversations`; `messages` (OpenAI chat format, append-only for prefix caching; `meta` is UI-only and never sent to the model; `meta.kind = 'error'` rows are filtered out of history); `steps`; `artifacts` + `artifact_versions` (every change is a version; `data` holds form answers; each version records cost and duration of the work that produced it); `artifact_deps` (upstream → downstream lineage); `usage` (one row per model call).
- **Data access**: `src/lib/server/store.ts`, including `downstreamOf` (transitive stale set) and `estimateRedo` (sums the cost/duration of the last non-user version of each stale artifact).
- **Crusoe client** (`src/lib/server/crusoe.ts`): streaming fetch, jittered backoff on 429/503 before the first byte, per-model throttle on `x-ratelimit-remaining-requests`, reads `reasoning_content`/`reasoning`, price table for cost.
- **Agent** (`src/lib/server/agent/`): `prompt.ts` (stable system prompt; edit-policy rules), `tools.ts` (`set_plan`, `update_step`, `create_form`, `create_artifact`, `update_artifact`, `read_artifact`, `quick_edit`, `mark_fresh`, `propose_redo`; schema order is part of the cached prefix), `run.ts` (loop, max 12 turns, one run per conversation, tool calls run concurrently and results are appended in call order), `subagent.ts` (`quick_edit` on the fast model), `edits.ts` (form submit / user edit / proposal answer → `[Form submitted]` / `[Edit]` / `[Approved]`·`[Declined]` messages; edits carry a field diff, the stale list and a redo estimate).
- **Redo approval**: for large changes the agent calls `propose_redo`; the tool result's `meta` (`kind: 'proposal'`, keyed by the tool call id) renders as `ProposalCard` with a grounded estimate (`store.estimateRedo` plus optional extra cost/time) and Approve/Keep buttons. The answer is a `proposal_reply` user message; a proposal can only be answered once.
- **Step status** follows artifacts: `store.syncStepStatus` turns a done step `stale` while any of its artifacts is stale/updating and back to `done` when they're fixed.
- **API**: `POST /api/conversations`; `GET|DELETE /api/conversations/[id]`; `POST /api/conversations/[id]/run` (body `message` | `form_submit` | `artifact_edit` | `proposal_reply`; streams NDJSON `RunEvent`s from `#lib/types.ts`); `POST /api/conversations/[id]/cancel`.
- **Agent loop details**: tool calls run in call order (a form can reference a step that `set_plan` created in the same turn); only consecutive `quick_edit` calls run in parallel.
- **UI**: `/` is the start page (creates a conversation, then runs); `/c/[id]` loads `conversationState` (`depends('app:conversation')`) and renders `components/Workspace.svelte`: chat in the middle, with pending forms embedded inline where the agent asked and other artifacts as cards; on the right, `ProcessPanel` (steps, artifacts per step, usage and cache-hit rate) or `ArtifactView` (versions, lineage links, edit → `artifact_edit`). The open artifact is in `?a=<id>`, so links deep-link. `ArtifactView` highlights form answers changed since the previous version and shows a line diff for documents/HTML (`#lib/diff.ts`). `/library` searches every artifact across conversations (`store.searchArtifacts`: title, content, answers, conversation title) with kind filters. `src/lib/client/run.svelte.ts` holds the live run state and invalidates on `changed` events. HTML artifacts render in an iframe with `sandbox="allow-scripts"`, no same-origin and a CSP that blocks network; markdown is sanitized with DOMPurify in the browser.
- **Svelte/Kit 3 gotchas hit so far**: `browser` comes from `$app/env` (`$app/environment` is deprecated and untyped); `goto` options are `reset`/`replace`, not `noScroll`/`keepFocus`; `page.url.searchParams` is read-only (copy via `new URLSearchParams(page.url.search)`); don't name a prop `state` (it clashes with the `$state` rune).
- **Mock agent** (`agent/mock.ts`) stands in for the model's judgment: editing `goal` or `audience` triggers `propose_redo`, other fields a `quick_edit`. Its tool call ids are random so proposal replies stay unique across restarts.
- **Status (2026-10-17)**: verified end to end with the mock agent: goal → plan + inline form → submit → brief → small edit patched by a sub-agent; large edit → proposal → approve (redo) or decline (stays stale); version diffs; library search. Not yet run against the real Crusoe API (no key in this environment); model IDs `openai/gpt-oss-120b` and `deepseek-ai/Deepseek-V4-Flash` are confirmed in the skill doc but not yet against `/v1/models`.

## Environment and commands

This is a team repo, and collaborators work through their own Claude agents, so everyone must run identical tooling:

- **Node 24.22.0** (bundles npm 11.19.1) is pinned by the root `.nvmrc`. Each Bash call is a fresh shell, so prefix Node commands with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`; nvm finds the root `.nvmrc` from any subfolder. On Windows (nvm-windows ignores `.nvmrc`), run `nvm use 24.22.0`.
- `devEngines` in `frontend/package.json` rejects any other Node or npm version, but only for `npm` commands, **not `npx`**. Always go through npm scripts.
- Install with `npm ci`. Run `npm install <pkg>` only to add a dependency, then commit `package-lock.json`. Never delete or regenerate the lockfile: it carries the native binaries for every OS.
- Dependency install scripts are denied in `allowScripts`; the current packages ship prebuilt binaries. If a new dependency genuinely needs its script, review it and run `npm install-scripts approve <pkg>`.
- Shared Claude Code permissions live in `.claude/settings.json`. Personal overrides go in `.claude/settings.local.json`, which is gitignored.

Commands, from `frontend/`:

- `npm ci`: install the exact locked dependencies
- `npm start` (alias of `npm run dev`): dev server at http://localhost:5173
- `npm run build`: production build to `build/`; run it with `node build`
- `npm run check`: svelte-check type checking
- `npm test`: all unit tests once; `npm test -- src/lib/foo.spec.ts` for one file
- `npm run lint` / `npm run format`: Prettier check / write
- `npm run db:push`: apply `schema.ts` to the local database (run it after pulling schema changes)

Browser preview in the Claude desktop app: the preview runner can't read `~/Documents` (macOS privacy), so start the dev server from Bash in the background (`npm start -- --port 5180 --strictPort`) and point a gitignored `.claude/launch.json` entry at it with `"url": "http://localhost:5180"` and no command. (`db:generate` / `db:migrate` for migrations, `db:studio` to browse)

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
