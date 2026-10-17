# Workbench API

The contract between the frontend (Svelte components) and the backend (SvelteKit server code in `frontend/src/lib/server/`). Generated from the code and kept current by the 10-minute API-sync job; if this file and the code disagree, the code wins.

Last synced: `471bfca` (2026-10-17 15:39).

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
| PUT | `/api/conversations/[id]/artifacts/[artifactId]` | `{ spec: FormSpec }` | `{ version }`; replaces the questions of a form still awaiting answers, with no agent run; forms only (a widget id gives 404) | 400 (`spec is required`, `A form needs at least one question`, `Nothing changed`), 404 (`Unknown form`), 409 (`Form already answered…`: use `artifact_edit` with `spec` instead) |

### `POST /api/conversations/[id]/run`

Starts one agent run and streams its events. Only one run per conversation at a time (409 otherwise). If the browser disconnects, the run keeps going and is saved.

`RunBody` is one of:

| `type` | Fields | Use |
|---|---|---|
| `message` | `content: string` (non-empty) | User chat message |
| `form_submit` | `artifactId`, `values: Record<string, unknown>` | Submit a pending form or widget (a widget's `values` is whatever object it passed to `$submit`); on an already-answered one it acts as `artifact_edit` `<-- Gaelan` |
| `artifact_edit` | `artifactId`, `values?` and/or `spec?` (forms: answers and replacement questions), `values` (widgets: the new submitted object, required; `content` is ignored) or `content?` (documents, html) | User edits an artifact; downstream artifacts go stale `<-- Gaelan` |
| `proposal_reply` | `callId`, `approved: boolean` | Answer a redo proposal; `callId` comes from the proposal message's `meta.callId` |

400 errors: `Body must be a JSON object`, `Unknown type`, `artifactId is required` (form_submit, artifact_edit), `callId and approved are required` (proposal_reply), `Empty message`, `Unknown form` (not a form or widget), `Unknown artifact`, `Unknown proposal`, `Already answered`, `Nothing changed` (no differences; for a widget also when `values` is missing), `A form needs at least one question`, `The widget sent invalid data: <problems>` (widget `values` is not an object, is over 20,000 characters of JSON, or fails the widget's `schema`; applies to `form_submit` and `artifact_edit`). `<-- Gaelan`

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
| all pages (`+layout.server.ts`) | `{ conversations: Conversation[], mock: boolean, model: string \| null }` (`mock` is true when no Crusoe key is set; `model` is `CRUSOE_AGENT_MODEL`, or null in mock mode) | `app:conversations` |
| `/c/[id]` | `{ state: ConversationState, running: boolean }`; 404 if missing | `app:conversation` |
| `/library?q=&kind=` | `{ q, kind: ArtifactKind or null, results: LibraryResult[] }`; `kind` accepts `form`, `widget`, `document`, `html`, anything else is null `<-- Gaelan` | URL change |

## Data shapes

Timestamps are `Date` objects in `load` data and ISO strings in JSON responses.

**`ConversationState`** (from `store.conversationState`):

```ts
{
  conversation: Conversation,
  messages: Message[],
  steps: Step[],
  artifacts: (Artifact & { versions: ArtifactVersion[]; upstream: string[] })[], // versions newest first; upstream = artifact ids it was built from
  usage: { calls, costUsd, promptTokens, cachedTokens, completionTokens },
  calls: UsageCall[] // every model call, oldest first (store.listUsage); feeds the Run log tab <-- James
}
```

| Type | Fields |
|---|---|
| `Conversation` | `id`, `title` (default "New conversation"), `createdAt`, `updatedAt` |
| `Message` | `id`, `conversationId`, `seq`, `role: 'user' \| 'assistant' \| 'tool'`, `content`, `toolCalls: ToolCall[] \| null`, `toolCallId`, `meta: MessageMeta \| null`, `createdAt` |
| `Step` | `id`, `conversationId`, `position`, `title`, `status: 'pending' \| 'active' \| 'done' \| 'stale'`, `summary`, `createdAt` |
| `Artifact` | `id`, `conversationId`, `stepId`, `kind: 'form' \| 'widget' \| 'document' \| 'html'` `<-- Gaelan`, `title`, `status: 'ready' \| 'awaiting_input' \| 'stale' \| 'updating'`, `currentVersion`, `createdAt`, `updatedAt` |
| `ArtifactVersion` | `id`, `artifactId`, `version`, `content`, `data` (form answers, or the object a widget submitted), `note`, `author: 'agent' \| 'user' \| 'subagent'`, `model`, `costUsd`, `durationMs`, `createdAt` |
| `UsageCall` | `id`, `conversationId`, `model`, `role: 'agent' \| 'subagent'`, `promptTokens`, `cachedTokens`, `completionTokens`, `costUsd`, `durationMs`, `createdAt`; one row per model call. The Run log joins agent calls to assistant messages in order (their `toolCalls`) and sub-agent calls to the `subagent` artifact version with the same model, cost and duration (`#lib/client/run-log.ts`) `<-- James` |
| `LibraryResult` | `id`, `kind`, `title`, `status`, `version`, `updatedAt`, `conversationId`, `conversationTitle`, `stepTitle`, `stepPosition`, `content`, `data` |

**Artifact `content` by kind:** `form` is a JSON string of `FormSpec`; `widget` is a JSON string of `WidgetSpec` `<-- Gaelan`; `document` is markdown; `html` is a full HTML page rendered in an iframe with `sandbox="allow-scripts"` (no network).

**`FormSpec`:** `{ description?, fields: FormField[], submitLabel? }`. Every question is optional and every answer is free text, so values are strings. A `FormField` has `name`, `label`, `type`, and optionally `options`, `placeholder`, `help` and `default`. `type` is `text` or `textarea` only; `options` are suggestion chips the UI toggles into a comma-separated answer. Older specs with `select`, `radio`, `date` and so on are converted by `normalizeFormSpec` (`frontend/src/lib/forms.ts`). `<-- Gaelan`

**`WidgetSpec`** (`<-- Gaelan`; created by the agent's `create_widget` tool, which sets the artifact to `awaiting_input`; `data_schema` there is stored as `schema`): `{ html, description?, schema?: DataSchema }`. `html` is a petite-vue fragment (at most 40,000 characters, must call `$submit`, no external `<script src>` or http `<link>`) run in a sandboxed iframe with no network. Inside it `$submit(obj)` sends a JSON object back (the frontend turns it into a `form_submit` run, or `artifact_edit` once answered) and `$initial` is the last submitted object or null. `DataSchema` is a JSON Schema subset: `type` (`object`, `array`, `string`, `number`, `integer`, `boolean`), `properties`, `required`, `items`, `enum`, `minimum`, `maximum`, `description`; submissions that fail it are rejected with the 400 above. Widgets have no question-editing endpoint. The agent can fix an unanswered widget in place with `update_artifact` (new version, still `awaiting_input`); answered widgets and forms can only be re-asked with a new artifact. An edit message to the agent lists leaf-level changes like `- people[0].name: "Person 1" → "Alex"`. The library snippet for a widget is its submitted data as `key: value` pairs.

**`MessageMeta`** (UI-only annotations, never sent to the model):

| `kind` | Fields | Render as |
|---|---|---|
| `form_submit` | `artifactId`, `version` | "Submitted form" note (also used for a submitted widget) `<-- Gaelan` |
| `artifact_edit` | `artifactId`, `version`, `staleIds` | Edit note plus stale list |
| `artifact` | `artifactId` | Artifact card in chat |
| `proposal` | `callId`, `artifactIds`, `summary`, `plan`, `costUsd`, `durationMs` | Redo proposal card; answer via `proposal_reply` |
| `proposal_reply` | `callId`, `approved` | Approved / declined note |
| `check` | `problems: string[]` | Self-check chip: the agent's final reply mentioned artifacts that don't exist, so it was sent back (at most twice per run) |
| `error` | none | Error row; excluded from model history |
