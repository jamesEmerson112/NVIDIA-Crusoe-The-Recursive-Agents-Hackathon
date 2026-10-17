# Workbench API

The contract between the frontend (Svelte components) and the backend (SvelteKit server code in `frontend/src/lib/server/`). Generated from the code and kept current by the 10-minute API-sync job; if this file and the code disagree, the code wins.

Last synced: `55d2d7c` (2026-10-17 14:41).

`<-- Name` marks parts a teammate added or changed in the last hour (usually Gaelan, backend), so the frontend knows what is still moving. The sync job adds and expires these arrows.

Shared types live in `frontend/src/lib/types.ts` (import as `#lib/types.ts`). Row shapes come from the Drizzle schema in `frontend/src/lib/server/db/schema.ts`.

## HTTP endpoints

All under `/api`, JSON unless noted. Errors are SvelteKit errors: `{ "message": string }` with the status code.

| Method | Path | Body | Returns | Errors |
|---|---|---|---|---|
| POST | `/api/conversations` | none | `{ id }` | |
| GET | `/api/conversations/[id]` | none | `ConversationState` | 404 |
| DELETE | `/api/conversations/[id]` | none | 204; cancels any run first | |
| POST | `/api/conversations/[id]/run` | `RunBody` | NDJSON stream of `RunEvent` | 400, 404, 409 |
| POST | `/api/conversations/[id]/cancel` | none | 204 | |
| PUT | `/api/conversations/[id]/artifacts/[artifactId]` | `{ spec: FormSpec }` | `{ version }`; replaces the questions of a form still awaiting answers, with no agent run | 400 (`spec is required`, `A form needs at least one question`, `Nothing changed`), 404 (`Unknown form`), 409 (`Form already answered…`: use `artifact_edit` with `spec` instead) `<-- Gaelan` |

### `POST /api/conversations/[id]/run`

Starts one agent run and streams its events. Only one run per conversation at a time (409 otherwise). If the browser disconnects, the run keeps going and is saved.

`RunBody` is one of:

| `type` | Fields | Use |
|---|---|---|
| `message` | `content: string` (non-empty) | User chat message |
| `form_submit` | `artifactId`, `values: Record<string, unknown>` | Submit a pending form; on an already-answered form it acts as `artifact_edit` |
| `artifact_edit` | `artifactId`, `values?` and/or `spec?` (forms: answers and replacement questions) or `content?` (documents, html) | User edits an artifact; downstream artifacts go stale `<-- Gaelan` |
| `proposal_reply` | `callId`, `approved: boolean` | Answer a redo proposal; `callId` comes from the proposal message's `meta.callId` |

400 errors: `Body must be a JSON object`, `Unknown type`, `artifactId is required` (form_submit, artifact_edit), `callId and approved are required` (proposal_reply), `Empty message`, `Unknown form`, `Unknown artifact`, `Unknown proposal`, `Already answered`. `<-- Gaelan`

Response: `Content-Type: application/x-ndjson`, one JSON `RunEvent` per line:

| `type` | Fields | Meaning |
|---|---|---|
| `status` | `text` | Short status ("Thinking", "Continuing") |
| `delta` | `text` | Next chunk of the assistant's chat reply |
| `reasoning` | `text` | Next chunk of model reasoning |
| `tool` | `name`, `summary` | A tool call ran (e.g. `set_plan`, "Planned 5 steps") |
| `changed` | none | Stored state changed: re-fetch or `invalidate('app:conversation')` |
| `error` | `message` | The run failed |
| `done` | none | Run finished; the stream closes |

`frontend/src/lib/client/run.svelte.ts` already consumes this stream and invalidates on `changed`.

## Page data (SvelteKit `load`)

| Route | Load returns | Invalidate with |
|---|---|---|
| all pages (`+layout.server.ts`) | `{ conversations: Conversation[], mock: boolean, model: string \| null }` (`mock` is true when no Crusoe key is set; `model` is `CRUSOE_AGENT_MODEL`, or null in mock mode) | `app:conversations` `<-- James` |
| `/c/[id]` | `{ state: ConversationState, running: boolean }`; 404 if missing | `app:conversation` |
| `/library?q=&kind=` | `{ q, kind: ArtifactKind or null, results: LibraryResult[] }` | URL change |

## Data shapes

Timestamps are `Date` objects in `load` data and ISO strings in JSON responses.

**`ConversationState`** (from `store.conversationState`):

```ts
{
  conversation: Conversation,
  messages: Message[],
  steps: Step[],
  artifacts: (Artifact & { versions: ArtifactVersion[]; upstream: string[] })[], // versions newest first; upstream = artifact ids it was built from
  usage: { calls, costUsd, promptTokens, cachedTokens, completionTokens }
}
```

| Type | Fields |
|---|---|
| `Conversation` | `id`, `title` (default "New conversation"), `createdAt`, `updatedAt` |
| `Message` | `id`, `conversationId`, `seq`, `role: 'user' \| 'assistant' \| 'tool'`, `content`, `toolCalls: ToolCall[] \| null`, `toolCallId`, `meta: MessageMeta \| null`, `createdAt` |
| `Step` | `id`, `conversationId`, `position`, `title`, `status: 'pending' \| 'active' \| 'done' \| 'stale'`, `summary`, `createdAt` |
| `Artifact` | `id`, `conversationId`, `stepId`, `kind: 'form' \| 'document' \| 'html'`, `title`, `status: 'ready' \| 'awaiting_input' \| 'stale' \| 'updating'`, `currentVersion`, `createdAt`, `updatedAt` |
| `ArtifactVersion` | `id`, `artifactId`, `version`, `content`, `data` (form answers), `note`, `author: 'agent' \| 'user' \| 'subagent'`, `model`, `costUsd`, `durationMs`, `createdAt` |
| `LibraryResult` | `id`, `kind`, `title`, `status`, `version`, `updatedAt`, `conversationId`, `conversationTitle`, `stepTitle`, `stepPosition`, `content`, `data` |

**Artifact `content` by kind:** `form` is a JSON string of `FormSpec`; `document` is markdown; `html` is a full HTML page rendered in an iframe with `sandbox="allow-scripts"` (no network).

**`FormSpec`:** `{ description?, fields: FormField[], submitLabel? }`. Every question is optional (there is no `required` flag `<-- Gaelan`). A `FormField` has `name`, `label`, `type`, and optionally `options`, `placeholder`, `help` and `default`. `type` is one of `text`, `textarea`, `number`, `email`, `date`, `select`, `radio`, `checkbox`, `checkboxes`.

**`MessageMeta`** (UI-only annotations, never sent to the model):

| `kind` | Fields | Render as |
|---|---|---|
| `form_submit` | `artifactId`, `version` | "Submitted form" note |
| `artifact_edit` | `artifactId`, `version`, `staleIds` | Edit note plus stale list |
| `artifact` | `artifactId` | Artifact card in chat |
| `proposal` | `callId`, `artifactIds`, `summary`, `plan`, `costUsd`, `durationMs` | Redo proposal card; answer via `proposal_reply` |
| `proposal_reply` | `callId`, `approved` | Approved / declined note |
| `check` | `problems: string[]` | Self-check chip: the agent's final reply mentioned artifacts that don't exist, so it was sent back (at most twice per run) `<-- Gaelan` |
| `error` | none | Error row; excluded from model history |
