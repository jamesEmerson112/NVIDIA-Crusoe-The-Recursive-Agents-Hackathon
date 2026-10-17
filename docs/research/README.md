# Research

Background research for the team, compiled 2026-10-17 by parallel research agents and fact-checked against primary sources. Every file labels its claims (official docs, independent benchmark, vendor claim, press, inference) and ends with its sources. Each one also has a "Fit with our stack" section. The first five were written for the original Angular + three.js frontend; the last three target the SvelteKit Workbench app, which has no three.js yet.

| File | Topic |
|---|---|
| [build-our-own-obsidian.md](build-our-own-obsidian.md) | Building our own Obsidian-style knowledge base, and using it as shared agent memory |
| [gpt-6-astra-blender-threejs.md](gpt-6-astra-blender-threejs.md) | OpenAI GPT-6 Astra driving Blender, and getting Blender models into three.js |
| [claude-3d-sculpting.md](claude-3d-sculpting.md) | How Claude does 3D modeling and sculpting |
| [astra-vs-claude-for-3d.md](astra-vs-claude-for-3d.md) | Which jobs to give Astra and which to give Claude, plus a bake-off plan |
| [sf-buildings-3d.md](sf-buildings-3d.md) | Existing San Francisco buildings in 3D with three.js |
| [floorplan-datasets-formats.md](floorplan-datasets-formats.md) | Open floorplan datasets, their licenses, exchange formats, and whether real SF floorplans are obtainable |
| [floorplan-2d-to-3d.md](floorplan-2d-to-3d.md) | Turning a floorplan into walls, doors and rooms in three.js, and synthetic interiors inside SF footprints |
| [building-performance-simulation.md](building-performance-simulation.md) | Energy, daylight and thermal comfort simulation for SF buildings |

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

**Floorplan datasets and formats.** Use Swiss Dwellings v3.0.0 (Zenodo, CC BY 4.0): about 45k apartments as polygons in metres, with window sizes and precomputed sun and daylight per room. The well-known sets are non-commercial (CubiCasa5k) or gated behind applications (ZInD, RPLAN, Structured3D, 3D-FRONT). Real SF floorplans aren't practical: DBI copies need the owner's notarized consent, $152 and up to 30 days. Keep an internal JSON of levels, rooms, walls and openings in metres, and emit gbXML or HPXML only for energy runs.

**Floorplan 2D to 3D.** Build walls as box segments around openings in plain three.js; a 3-story SF flat with 45 openings is about 1,600 triangles, built in about 15 ms, which beats CSG. Copy openPlan3D's plan JSON (MIT, SvelteKit + three.js, ships an LLM plan-authoring skill). In Workbench the plan is an artifact, rendered by a lazily loaded Svelte component. Interiors inside SF footprints are synthetic templates and must be labelled as such.

**Building performance simulation.** EnergyPlus 26.2.0 runs headless on an M1 in 1.2–6.5 s per annual simulation, and `geomeppy` (MIT) builds a model from an SF footprint, height and story count in 0.6 s. Ground truth: SF's benchmarking data (`4ua7-5sfx`, public domain, 30,483 rows) joins to 89.5% of footprints; ResStock/ComStock medians (CC BY 4.0) cover the rest. Have the LLM pick model parameters, not write EnergyPlus files. Ladybug/honeybee is AGPL-3.0. NREL is now the National Laboratory of the Rockies (`NatLabRockies` on GitHub).
