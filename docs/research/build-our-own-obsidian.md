# Build our own Obsidian: a markdown vault as shared agent memory

Researched 2026-10-17. Versions are the latest on npm or GitHub on that date unless a release date is given. Labels: [official docs], [code/repo], [vendor claim], [press], [inference].

## TL;DR

- Obsidian is a closed-source Electron app sitting on open formats: a folder of `.md` files with YAML frontmatter, `[[wikilinks]]`, and JSON Canvas (`.canvas`, MIT). Everything else (link index, graph, search, Bases, Sync) can be rebuilt. Its editor is CodeMirror 6 ([editor docs](https://docs.obsidian.md/Plugins/Editor/Editor+extensions)) [official docs]. PixiJS is listed among its libraries ([credits](https://obsidian.md/help/credits)) [official docs], and a 2020 developer post says PixiJS draws the graph.
- **Recommended MVP:** a small Node backend that serves one vault folder (list/read/write/search, plus a file watcher that pushes changes over SSE). Git syncs it between teammates. On top of that: an Angular note view (CM6 editor plus rendered markdown), a backlinks panel, MiniSearch, and a 3D graph from `3d-force-graph`. Agents read and write the **same files** through plain tool functions. [inference]
- Agents run outside the browser and need real files on disk. OPFS is hidden from the user, and the File System Access API is Chromium-desktop-only. So browser-only storage works for a demo but not for shared memory ([caniuse](https://caniuse.com/native-filesystem-api), [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)).
- For agent memory, follow Karpathy's "LLM Wiki" pattern (April 2026): raw sources, an LLM-maintained wiki, and a schema file, plus `index.md` and `log.md` ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)) [code/repo].

## 1. How Obsidian works under the hood

**Vault = folder on disk.** Notes are plain markdown. Obsidian encrypts nothing locally, and Sync encrypts only the remote copy ([Sync security](https://obsidian.md/help/sync/security)) [official docs].

**Link syntax** ([links help](https://obsidian.md/help/links)) [official docs]:
- `[[Note]]`, `[[Folder/Note]]`, `[[Note|display text]]`, `[[Note#Heading#Sub]]`, `[[#Heading]]` (same note), `[[Note#^blockid]]`, and `![[Note]]` (embed).
- A block ID is ` ^id` at the end of a paragraph, or on its own line after a list, quote or table. Allowed characters are Latin letters, digits and dashes. Block refs are Obsidian-specific, not standard markdown.
- Markdown-style links (`[text](Note%20Name.md)`) are an optional setting. Renaming a file rewrites internal links automatically (or after a prompt, depending on settings).

**Properties** ([properties help](https://obsidian.md/help/properties)) [official docs]: YAML frontmatter. The types are text, list, number, checkbox, date, date & time, and tags. A property's type applies across the whole vault. The default properties are `tags`, `aliases` and `cssclasses`. The old names `tag`, `alias` and `cssclass` were deprecated in 1.4, and support for them as default properties was dropped in 1.9.

**Metadata cache / link index.** The plugin API exposes `MetadataCache.resolvedLinks` and `unresolvedLinks`, both shaped `Record<sourcePath, Record<destPath, count>>`. Backlinks are the inverse of this map ([resolvedLinks](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/resolvedLinks), [unresolvedLinks](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/unresolvedLinks)) [official docs]. The Backlinks core plugin defines "linked mentions" (notes with an internal link to this one) and "unlinked mentions" ("any unlinked occurrence of the name of the active note"). The docs don't say whether aliases count ([backlinks](https://obsidian.md/help/plugins/backlinks)) [official docs].

**Search** supports `file:`, `path:`, `tag:`, `line:`, `block:`, `section:`, `task:`, `[property:value]` and JavaScript regex inside `/.../` ([search help](https://obsidian.md/help/plugins/search)) [official docs]. That makes a good target grammar for our own search box.

**Graph view.** There is a global graph and a local graph (with a depth slider), plus filters, color groups, and center, repel and link forces ([graph help](https://obsidian.md/help/plugins/graph)) [official docs]. PixiJS is credited as a third-party library ([credits](https://obsidian.md/help/credits)) [official docs]. A 2020 forum post by an Obsidian developer says PixiJS draws the nodes and edges and D3 runs the force simulation ([forum](https://forum.obsidian.md/t/what-is-the-tech-stack-currently/833)). That source is old and unverified for today's app, and I found no evidence of a web worker. Obsidian's graph is 2D, so a 3D graph would set us apart.

**Parsing.** The credits list Lezer (CM6's parser), remark, YAML, DOMPurify, Prism, Mermaid and MathJax [official docs]. The same 2020 post mentions markdown-it. I could not confirm today's reading-view parser.

**Canvas** uses [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/), released as an open MIT spec in March 2024 ([announcement](https://obsidian.md/blog/json-canvas/)) [official docs]. The format has two top-level arrays, `nodes` and `edges`. Node types are `text`, `file` (with an optional `#subpath`), `link` and `group`, each with integer `x/y/width/height`. Edges have `fromNode/toNode`, optional sides and ends, and color is a hex value or a preset from `"1"` to `"6"`. The format is small enough to support in a few hours.

**Plugin API.** The `obsidian` npm package (1.14.4, MIT) contains only type definitions, and the closed app supplies the implementation ([repo](https://github.com/obsidianmd/obsidian-api)) [code/repo]. Editor plugins are plain CM6 extensions [official docs]. Bases (database views over properties, stored in `.base` files) got a plugin API in 1.10.0 on 2025-10-01 ([changelog](https://obsidian.md/changelog/2025-10-01-desktop-v1.10.0/)) and a kanban view in 1.14.x (September-October 2026) ([changelog](https://obsidian.md/changelog/)) [official docs].

**Sync and automation.** Sync uses end-to-end encryption: AES-256-GCM, with keys derived by salted scrypt [official docs]. It costs $4/month billed annually or $5 monthly ([blog](https://obsidian.md/blog/standard-plan/)) [vendor claim]. On 2026-02-27 Obsidian shipped two tools:
- an official CLI, which needs the app running and installer 1.12.7+ ([CLI](https://obsidian.md/help/cli)) [official docs]
- `obsidian-headless`, a headless Sync client (open beta, Node 22+) aimed at CI and agent access ([headless](https://obsidian.md/help/headless)) [official docs]

The app has been free for work use since 2025-02-20 ([blog](https://obsidian.md/blog/free-for-work/)) [official docs].

**Open vs closed:** the app, Sync protocol, Publish and graph renderer are closed. Markdown, YAML frontmatter, wikilink syntax (a de facto convention), JSON Canvas (MIT) and the API typings (MIT) are open.

## 2. Open-source prior art

| Project | License | Stack | Latest (date) | What to copy |
|---|---|---|---|---|
| [Logseq](https://github.com/logseq/logseq) | AGPL-3.0 | ClojureScript, DataScript | 2.0.2 (2026-10-07), the DB-graph beta | Block-level refs and queries. On 2026-04-24 the markdown version split off as maintenance-only **Logseq OG** ([repo](https://github.com/logseq/og), [post](https://logseq.io/p/e3YDyX5AYr)), so look there for file-based code. |
| [Foam](https://github.com/foambubble/foam) | MIT | TypeScript, VS Code extension | vscode@0.46.0 (2026-09-30) | The closest analogue to us: wikilink resolution, backlinks panel, graph, and link-reference definitions so wikilinks still render outside Foam. |
| [SilverBullet](https://github.com/silverbulletmd/silverbullet) | MIT | Client: TypeScript + CM6 + Preact. Server: Rust | 2.12.1 (2026-10-12) | A browser editor over a server-side folder, which matches our backend plan. Also: CM6 live preview, an objects index plus query language, and Space Lua scripting. |
| [Zettlr](https://github.com/Zettlr/Zettlr) | GPL-3.0 | Electron, Vue 3, CM6 | v4.8.0 (2026-09-18) | CM6 markdown editing done well, Zettelkasten IDs, citations. GPL, so read the code but don't copy it. |
| [Trilium](https://github.com/TriliumNext/Trilium) (TriliumNext now hosts the canonical repo) | AGPL-3.0 | TypeScript, Electron, CKEditor 5 | v0.106.0 (2026-09-25) | Note hierarchy and a self-hosted sync server. It is database-backed rather than markdown-first [inference]. |
| [Joplin](https://github.com/laurent22/joplin) | AGPL-3.0-or-later (per-directory exceptions) | Electron, React Native, CM6 | v3.7.21 (2026-09-25) | E2EE sync to WebDAV, Dropbox or OneDrive, and a plugin system. |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | MIT outside `packages/backend` | TypeScript, BlockSuite, Yjs CRDT, Rust | v0.27.4 (2026-08-18) | A CRDT-first local-first design, and a whiteboard alongside docs. |
| [Quartz](https://github.com/jackyzha0/quartz) | MIT | unified/remark, Preact SSG | Latest release tag v4.0.8 (2023). The default branch's `package.json` reads 5.0.0 | A publishing pipeline. The v5 branch splits features into `@quartz-community/*` plugins, including `obsidian-flavored-markdown`, `graph`, `backlinks`, `canvas-page` and `bases-page`, which make a good reference implementation for parsing OFM. |

**Notable 2025-2026 projects** [code/repo]:
- [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) (MIT, about 15.6k stars) and [SwarmVault](https://github.com/swarmclawai/swarmvault) (MIT) are LLM-wiki builders over a plain vault.
- [vouch](https://github.com/vouchdev/vouch) (MIT) is a git-native knowledge base where agents propose writes and a human approves them.
- [Basic Memory](https://github.com/basicmachines-co/basic-memory) (AGPL-3.0, v0.23.2 on 2026-08-25) is an MCP server that stores markdown and indexes it in SQLite.

## 3. Building blocks for an Angular app

| Package | Version | License | Role |
|---|---|---|---|
| `@codemirror/view` / `state` | 6.43.14 / 6.7.6 | MIT | Editor core, the same base as Obsidian |
| `@codemirror/lang-markdown`, `@lezer/markdown` | 6.5.2, 1.8.0 | MIT | Markdown mode. Add a custom `InlineParser` for `[[...]]` ([lezer docs](https://github.com/lezer-parser/markdown)) |
| `@codemirror/autocomplete` | 6.20.3 | MIT | `[[` completion from the note index, the best value-for-effort feature |
| `codemirror-markdown-hybrid` | 1.2.2 | MIT | Drop-in "live preview": renders unfocused lines, shows raw markdown on the cursor line |
| `unified` + `remark-parse` + `remark-gfm` + `remark-frontmatter` | 11.0.5, 11.0.0, 4.0.1, 5.0.0 | MIT | Reading-view render pipeline |
| `@flowershow/remark-wiki-link` | 4.0.0 | MIT | Wikilinks with Obsidian-style aliases and headings. Its `@flowershow/core` dependency is about 35 kB unpacked |
| `markdown-it` (alternative) | 15.0.3 | MIT | Simpler renderer. Its wikilink plugins (`markdown-it-wikilinks` 1.4.0) are stale |
| `yaml` | 2.9.1 | ISC | Frontmatter parsing |
| `minisearch` | 7.2.0 | MIT | Default full-text search: prefix, fuzzy, field boost, incremental add/remove |
| `flexsearch` | 0.8.212 | Apache-2.0 | Faster, with workers and persistent IndexedDB indexes ("up to 1,000,000× faster" [vendor claim]) |
| `@orama/orama` | 3.1.18 | Apache-2.0 on npm, NOASSERTION on GitHub | Full-text + vector + hybrid search ("<2kb" [vendor claim]) |
| `3d-force-graph` / `three-forcegraph` | 1.80.1 / 1.43.6 | MIT | 3D force graph over three.js. Physics comes from `d3-force-3d` 3.0.6 (default) or ngraph |
| `chokidar` | 5.0.0 | MIT | Backend file watcher |
| `isomorphic-git` | 1.44.3 | MIT | Git in JavaScript, if we want commits without shelling out |
| `yjs` + `y-codemirror.next` | 13.6.33 + 0.3.6 | MIT | Real-time co-editing (stretch goal only) |

**Editor.** Use plain CM6 rather than an Angular wrapper. Create the `EditorView` in `afterNextRender` and call `view.destroy()` in `DestroyRef`. Rebuilding Obsidian-grade live preview means replace decorations and widgets ([CM decoration example](https://codemirror.net/examples/decoration/)). That is a project in itself, so take `codemirror-markdown-hybrid` or a split edit/preview view [inference]. Atomic Editor is React-only, and `ink-mde` (0.34.0) hasn't been updated since 2024 [code/repo].

**Link index (MVP).** Use a regex extractor rather than a full AST:
- links: `!?\[\[([^\]|#^]*)(#[^\]|^]*)?(\^[\w-]+)?(\|[^\]]+)?\]\]`. This matches `[[Note]]`, `[[Note|a]]`, `[[Note#H#Sub]]`, `[[Note#^abc]]`, `[[#H]]` and `![[Note]]`.
- also inline `#tags` and frontmatter (parsed with `yaml`)
- skip fenced and inline code

Build `outgoing: Map<path, Link[]>`, invert it into `backlinks`, and keep `unresolved` like Obsidian does. Unlinked mentions are a case-insensitive search for the title and aliases in notes that don't already link. Use remark only for rendering [inference].

**3D graph and our `ThreeScene`.** `3d-force-graph` declares `three: ">=0.179 <1"` as a dependency, and `three-forcegraph` and `three-render-objects` declare it as a peer, so npm should resolve a single copy against our 0.186.1 (ranges checked with `npm view` on 2026-10-17: 3d-force-graph 1.80.1, three-forcegraph 1.43.6, three-render-objects 1.43.0). Check `npm ls three` after installing [code/repo]. There are two ways to integrate:
1. **`3d-force-graph` as its own component (recommended for the MVP).** It owns its renderer, camera and controls (trackball, orbit or fly), and gives us `onNodeClick`, hover, `zoomToFit`, `nodeThreeObject` and `cooldownTicks` for free. Follow the house pattern:
   - check `WebGL.isWebGL2Available()` first
   - create it in `afterNextRender`
   - drive `.width()/.height()` from a `ResizeObserver`
   - call `_destructor()` and disconnect the observer in `DestroyRef` ([README](https://github.com/vasturiano/3d-force-graph), `src/3d-force-graph.js`)
2. **`three-forcegraph` as an `Object3D` inside our existing scene.** Add it to the scene and call `graph.tickFrame()` inside the current `setAnimationLoop` ([README](https://github.com/vasturiano/three-forcegraph)). This shares one WebGL context with the ThreeScene visuals, but we would write raycast picking and labels ourselves.

**Storage.**
- File System Access API (`showDirectoryPicker`): experimental, secure context only, needs a user gesture. Chrome and Edge support it fully from 105. Firefox, Safari (desktop and iOS) and Chrome Android don't. About 30% global usage ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker), [caniuse](https://caniuse.com/native-filesystem-api)) [official docs].
- OPFS (`navigator.storage.getDirectory()`): Baseline since March 2023, with fast sync handles in workers. But it is private to the origin, not visible as real files, and wiped when site data is cleared [official docs].
- IndexedDB: also a browser silo.
- **Verdict:** use a backend that serves a vault folder (REST plus SSE, with chokidar), and git for teammate and agent sync. Commit each agent write, and pull/push on a timer or button. Treat Yjs as a stretch goal: it creates a second source of truth that competes with the files agents write [inference].

## 4. Hackathon build order

**MVP (about 4-6 h, 2 people in parallel)** [inference]
1. `vault/` folder with seed notes and conventions (frontmatter schema, `index.md`, `log.md`, `agents/<name>/`). About 20 min.
2. Backend: `GET /notes`, `GET/PUT /notes/:path` (PUT carries an `If-Match` content hash), `GET /search?q=`, `GET /graph`, and `GET /events` (SSE from chokidar). The index (regex links, backlinks, MiniSearch) is rebuilt incrementally per changed file. About 1.5 h.
3. Agent tools as plain OpenAI-style functions over the same core: `list_notes`, `read_note`, `search_notes`, `get_backlinks`, `write_note`, `append_note`. Crusoe's tool calling can call these directly, so MCP is optional. About 1 h.
4. Angular: a note list, a note view (rendered markdown with clickable wikilinks), a backlinks panel and a search box. About 1.5 h.
5. Graph component (`3d-force-graph`, behind its own `@defer`). Clicking a node opens the note, nodes are colored by `type`/agent, and new nodes pulse when an agent writes. About 1 h.

**Stretch:** CM6 editor with `[[` autocomplete. Hybrid live preview. Unlinked mentions. Rename with link rewriting. JSON Canvas export of an agent's plan. Local-graph depth filter. Orama hybrid search (needs embeddings). Git history per note. Yjs co-editing.

**Pitfalls**
- **Renames:** rewrite every `[[old]]`, `[[old|alias]]`, `[[old#h]]` and `![[old]]`. Decide how bare names resolve when two folders hold `Note.md` (for example: prefer the same folder, else write a path-qualified link). macOS and Windows filesystems are case-insensitive, so normalize keys [inference].
- **Parsing:** invalid YAML must not crash indexing. Ignore links inside code. Heading anchors need a slug rule (Quartz and Flowershow use `github-slugger`) [code/repo].
- **Large vaults:** index incrementally (in a worker or on the backend). Set `cooldownTicks`/`warmupTicks` and consider ngraph for big graphs. Drop labels when zoomed out [inference].
- **Editor complexity:** don't hand-roll live preview in 6 hours. Watch the bundle (see Fit).
- **Agent writes during human edits:** detect via hash mismatch and show a diff or merge instead of silently overwriting.

## 5. The vault as shared long-term memory for agents

**Pattern (Karpathy, 2026-04-04 gist)** [code/repo]: three layers.
- Raw sources are immutable.
- The wiki is LLM-owned markdown: entity, concept and summary pages.
- A schema file (CLAUDE.md or AGENTS.md style) states the conventions.

The operations are Ingest, Query (good answers get filed back as pages) and Lint (contradictions, orphans, missing pages). `index.md` is the content catalog and `log.md` the chronological record. He keeps Obsidian open as the "IDE" while the agent edits. Our recursive planner, sub-agents and checker map directly onto ingest, query and lint [inference].

**Conventions to adopt** [inference, drawing on Basic Memory's format]:
- Frontmatter: `id`, `type` (task|decision|finding|agent|run), `status`, `owner_agent`, `created`, `updated`, `sources`, `tags`, `aliases`.
- Body: link entities with `[[wikilinks]]`. Optionally use Basic Memory-style typed lines, such as `## Observations` with `- [category] fact` and relation bullets like `- implements [[X]]`, so a parser can lift them into graph edges ([Basic Memory](https://github.com/basicmachines-co/basic-memory)) [code/repo].
- Paths: `agents/<name>/log.md` (append-only, one writer each), `tasks/`, `decisions/`, `runs/<date>/`. Humans own `index.md`, or a librarian agent rebuilds it.

**Conflict handling** [inference]:
- Single writer per log file.
- Optimistic concurrency on shared pages: `If-Match: <sha256>` and a retry that re-reads and merges.
- `append_note` under a heading instead of full rewrites (the Local REST API's heading and block PATCH is a good model).
- A git commit per write, with the agent name as author, for audit and rollback.
- Optionally vouch-style "propose, then approve" for canonical pages.

**Existing integrations** [code/repo]:
- The [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) (5.5.2, 2026-10-17) has a built-in MCP server, heading, block and frontmatter PATCH, and SSE events, but needs Obsidian running.
- [mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian) (MIT) and [obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server) (Apache-2.0, v3.7.0) wrap that plugin.
- Basic Memory, claude-obsidian and SwarmVault work headless on files.
- Anthropic's memory tool takes the same "agent gets a `/memories` directory, client executes file ops" approach ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)) [official docs].

## Fit with our stack

- Angular 22 zoneless: create the CM6 view and the graph in `afterNextRender`, dispose them in `DestroyRef`, and write callback results (node clicked, search results) into signals so the UI updates without zone.js.
- Put each heavy component (graph, editor) in its own `@defer` to protect the 500 kB initial budget. Measure with `npm run build` [inference].
- Reuse the `ThreeScene` conventions (WebGL2 check for jsdom tests, ResizeObserver sizing). Use `three-forcegraph` only if we want the graph inside the same scene.
- Add dependencies via `npm install <pkg>` and commit the lockfile. None of the packages above should need install scripts, and `allowScripts` stays as is [inference].
- Keep `three` and `@types/three` on the same minor (CLAUDE.md). A graph library upgrade must not pull a second `three`.
- The backend can be a tiny Node 24 service in the repo (for example `vault-server/`), shared by the UI and the agent runtime.

## Open questions

- Does Crusoe expose an embeddings model (for Orama or vector recall)? Check `GET /v1/models` through the project skill.
- Is the vault one shared git repo (in this repo, or separate), and who resolves merge conflicts during the demo?
- 3D graph as a separate panel, or merged into the existing ThreeScene visual?
- Do we need human editing at all for the MVP, or is a read-only viewer plus agent writes enough?
- Should we stay Obsidian-compatible (so judges can open the vault in Obsidian)? If yes, avoid custom syntax beyond wikilinks, frontmatter and block IDs.

## Sources

- https://obsidian.md/help/links · https://obsidian.md/help/properties · https://obsidian.md/help/plugins/backlinks · https://obsidian.md/help/plugins/search · https://obsidian.md/help/plugins/graph · https://obsidian.md/help/credits
- https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/resolvedLinks · https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/unresolvedLinks · https://docs.obsidian.md/Plugins/Editor/Editor+extensions
- https://forum.obsidian.md/t/what-is-the-tech-stack-currently/833
- https://jsoncanvas.org/spec/1.0/ · https://obsidian.md/blog/json-canvas/
- https://obsidian.md/help/sync/security · https://obsidian.md/blog/standard-plan/ · https://obsidian.md/blog/free-for-work/
- https://obsidian.md/changelog/ · https://obsidian.md/changelog/2025-10-01-desktop-v1.10.0/ · https://obsidian.md/changelog/2026-02-27-desktop-v1.12.4/ · https://obsidian.md/help/cli · https://obsidian.md/help/headless
- https://github.com/obsidianmd/obsidian-api · https://www.npmjs.com/package/obsidian
- https://github.com/logseq/logseq · https://github.com/logseq/og · https://logseq.io/p/e3YDyX5AYr
- https://github.com/foambubble/foam · https://github.com/silverbulletmd/silverbullet · https://github.com/Zettlr/Zettlr · https://github.com/TriliumNext/Trilium · https://github.com/laurent22/joplin · https://github.com/toeverything/AFFiNE · https://github.com/jackyzha0/quartz
- https://codemirror.net/examples/decoration/ · https://github.com/lezer-parser/markdown · https://www.npmjs.com/package/codemirror-markdown-hybrid
- https://github.com/lucaong/minisearch · https://github.com/nextapps-de/flexsearch · https://github.com/oramasearch/orama
- https://github.com/vasturiano/3d-force-graph · https://github.com/vasturiano/three-forcegraph · https://github.com/vasturiano/d3-force-3d
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker · https://caniuse.com/native-filesystem-api · https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://github.com/basicmachines-co/basic-memory · https://github.com/coddingtonbear/obsidian-local-rest-api · https://github.com/MarkusPfundstein/mcp-obsidian · https://github.com/cyanheads/obsidian-mcp-server
- https://github.com/vouchdev/vouch · https://github.com/AgriciDaniel/claude-obsidian · https://github.com/swarmclawai/swarmvault
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
