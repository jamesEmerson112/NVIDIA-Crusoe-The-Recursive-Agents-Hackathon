# Research

Background research for the team, compiled 2026-10-17 by parallel research agents and fact-checked against primary sources. Every file labels its claims (official docs, independent benchmark, vendor claim, press, inference) and ends with its sources. Each one also has a "Fit with our stack" section tied to the Angular + three.js frontend.

| File | Topic |
|---|---|
| [build-our-own-obsidian.md](build-our-own-obsidian.md) | Building our own Obsidian-style knowledge base, and using it as shared agent memory |
| [gpt-6-astra-blender-threejs.md](gpt-6-astra-blender-threejs.md) | OpenAI GPT-6 Astra driving Blender, and getting Blender models into three.js |
| [claude-3d-sculpting.md](claude-3d-sculpting.md) | How Claude does 3D modeling and sculpting |
| [astra-vs-claude-for-3d.md](astra-vs-claude-for-3d.md) | Which jobs to give Astra and which to give Claude, plus a bake-off plan |
| [sf-buildings-3d.md](sf-buildings-3d.md) | Existing San Francisco buildings in 3D with three.js |

## Summaries

**Build our own Obsidian.** Obsidian is closed source but built on open formats: a folder of markdown files, YAML frontmatter, `[[wikilinks]]` and JSON Canvas. Its editor is CodeMirror 6. The recommended MVP:
- a small Node server for one vault folder, with a file watcher pushing changes over SSE, synced between teammates with git;
- an Angular view with a CodeMirror 6 editor, a backlinks panel and MiniSearch;
- a 3D graph from `3d-force-graph`, which accepts our three.js 0.186.

Agents read and write the same files through tool functions. Browser-only storage can't serve as shared memory, because agents need real files on disk.

**GPT-6 Astra + Blender + three.js.** `gpt-6-astra` has a 1.05M-token context and 128K max output. It costs $10 / $50 per million tokens, doubling input above 272K. MCP and computer use work only through the Responses API. The practical route is Codex with Astra connected to the community `mcp-for-blender` server. The pipeline is Blender 5.2 → GLB → `gltf-transform` (Draco/meshopt/KTX2) → `GLTFLoader` in our `ThreeScene`. There's no independent Blender benchmark for Astra.

**Claude 3D sculpting.** Claude has no native 3D or image output. It writes code (Blender Python, three.js, CAD, shaders) or drives MCP tools: the community Blender MCP, Blender's official server, and Anthropic's Blender connector (announced 2026-04-28). Scripted sculpting works in headless Blender 5.2.2 once you call `undo_push()` first; this was tested on this machine. Procedural modeling plus a render-and-critique loop is the reliable route.

**Astra vs Claude.**
- **Claude** for code in and around this repo. Opus 5.5 leads visual front-end bug fixing (SWE-bench Multimodal 70.2% vs Astra's 43.3%, Vals). Sonnet 5.5 leads writing three.js scenes (AA-3D on three.js 0.186.0: 1194 vs Astra's 1165, a statistical tie), though Astra was cheaper per scene.
- **Astra** for Blender blockout, photo-to-scene and render critique when wall-clock time matters: it's roughly 3x faster per task at similar CAD quality.
- **Skip Fable 5.1** for 3D, and expect neither model to do characters well.
- **Run the bake-off** in that file before committing to a split.

**SF buildings in 3D.** The base layer is DataSF Building Footprints (`ynuv-fyni`): public domain, 177,023 buildings, each with a LiDAR height and a parcel number that joins to land use (unit counts) and assessor data (year built). Preprocess once into a roughly 10 MB binary. In the browser, extrude in a Web Worker into chunked meshes, color by housing attributes, and pick buildings by raycasting. The data's weakness is age: heights come from a 2010 model, so newer towers are missing or too short. Google's photorealistic 3D Tiles are a stretch option, needing attribution and free for 1,000 sessions a month.
