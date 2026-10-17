# How Claude does 3D sculpting and modeling (state as of 2026-10-17)

Research note for the team. Scope: every practical way Claude produces 3D today, what each can and cannot do, evidence quality, which Claude model to use, and a workflow that ends in a GLB loaded by our `ThreeScene` component. A later agent compares this with OpenAI's GPT-6 Astra driving Blender.

Evidence labels: [official docs] Anthropic or Blender documentation · [preprint] arXiv paper, not peer-reviewed · [code/repo] source code or README · [vendor claim] marketing or launch page numbers from the company selling the model/tool · [press] secondary article · [community demo] someone's showcase · [inference] my reasoning · **[verified locally]** I ran it today on this machine with Blender 5.2.2 LTS (macOS, `/Applications/Blender.app`).

## TL;DR

- **Claude has no native 3D output.** It writes code (Blender Python `bpy`, three.js, OpenSCAD/CadQuery, shaders) or calls tools (MCP servers). It also cannot generate images, so textures and concept art come from asset libraries or other generators ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)) [official docs].
- **Three Blender MCP options now exist:** (1) the community **MCP for Blender** (formerly `ahujasid/blender-mcp`, 31.4k stars), (2) the **Blender Lab official MCP server** (v1.0.3, Blender 5.1+), and (3) Anthropic's **Blender connector**, announced 2026-04-28. Press reports say the Blender developers built this MCP connector and Anthropic ships it as an official Claude connector, alongside joining the Blender Development Fund ([Digital Production](https://digitalproduction.com/2026/04/30/anthropic-funds-blender-ships-claude-connector/), [Unite.AI](https://www.unite.ai/anthropic-wires-claude-into-photoshop-blender-and-ableton/)) [press]. That it is the same codebase as (2) is likely but unconfirmed [inference].
- **Scripted sculpting does work headless, with workarounds.** `bpy.ops.sculpt.brush_stroke` and `mesh_filter` segfault in `blender -b` unless you push an undo step first. With that fix and a 3D-View context override, the strokes really change the mesh [verified locally]. But scripted strokes are blind, coordinate-driven sculpting. Nuanced organic detail still needs a human hand or a long render-and-critique loop.
- **The most reliable route for "sculpted-looking" assets:** procedural modeling (voxel remesh, multires, displacement, geometry nodes, metaballs) written by Claude Code, a headless render, Claude critiquing the PNGs, then a GLB export. A headless remesh + sculpt + GLB export run took about 1.8 s (no render in that timing) [verified locally].
- **Models:** use **Opus 5.5** ($4/$20 per MTok) to plan and write the generator. Use **Sonnet 5.5** ($2/$10) or Opus 5.5 at `medium`/`low` effort for the iterate-and-critique loop, and **Haiku 5.5** ($0.10/$0.50, rising 5x above 100K-token prompts) for bulk chores. Reserve **Fable 5.1** ($10/$50) for cases where Opus 5.5 stalls [official docs] + [inference].
- **I found no published Blender or 3D benchmark for any Claude 5.x model.** The research evidence (BlenderGym, peer-reviewed; LL3M, arXiv preprint) covers Claude 3.5 and 3.7 Sonnet.

## 1. The ways Claude produces 3D

### 1a. Blender MCP (Claude Desktop / Claude Code)

| | MCP for Blender (community) | Blender Lab MCP server (official) | Anthropic "Blender connector" |
|---|---|---|---|
| Who | Siddharth Ahuja + contributors; "not affiliated with the Blender Foundation" | Blender developers (Blender Lab) | Listed in Anthropic's [Claude for Creative Work](https://www.anthropic.com/news/claude-for-creative-work) (2026-04-28) |
| Tools | 9 consolidated tools per README: `execute_blender_code`, `look` (renders viewport, camera, multi-angle views or an animation strip in several shading modes), `get_scene_info`, `generate_3d` (Tripo / Hunyuan3D / Hyper3D Rodin), `search_assets` / `import_asset` (Poly Haven, Sketchfab, Poly Pizza), `get_addon_status`, plus two telemetry tools [code/repo] | The blender.org page lists no tools. A competitor's write-up counts 26: code execution, .blend/object summaries, area/window screenshots, viewport navigation, renders, search over the bundled Python API docs and manual, and six `_for_cli` background-process variants [press, competitor-authored] | "Natural-language interface to Blender's Python API": analyze and debug scenes, batch-apply scripts, add tools to Blender's UI [vendor claim] |
| Setup | `claude mcp add blender uvx mcp-for-blender`, or a Claude Desktop `mcpServers` entry running `uvx mcp-for-blender`; add-on via `uvx mcp-for-blender install-addon`; Blender 3.0+, Python 3.10+, uv [code/repo] | Install the add-on zip (Blender 5.1+); run the MCP server from the `.mcpb` bundle or from source; three separate parts to install by hand [official docs] | Same MCP standard; usable by other LLM clients [vendor claim] |
| Caveats | `execute_blender_code` runs arbitrary Python ("ALWAYS save your work"). The socket has no authentication (keep it on localhost). Opt-in `BLENDER_MCP_SAFE_MODE=1`. Anonymous telemetry is on by default (`DISABLE_TELEMETRY=true` to turn it off). "Sometimes the first command won't go through." [code/repo] | "Will execute LLM generated code in Blender without any guards in place"; recommends a VM. Its own example shows the LLM missing a Solidify modifier that doubled the polygon count [official docs] | A reviewer's take: useful "until it makes one confident, catastrophic mistake" ([Digital Production](https://digitalproduction.com/2026/04/30/anthropic-funds-blender-ships-claude-connector/)) [press] |

Release dates for the official server, from the competitor write-up: v1.0.0 on 2026-04-27, v1.0.3 on 2026-09-11 ("screenshot capture fix") ([StraySpark](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026)) [press, competitor-authored]. The same write-up counted 36 tools in MCP for Blender's `server.py` on 2026-09-25. Today's README lists 9, so the tools were probably consolidated in a later release [inference].

The same Anthropic post also announced **Autodesk Fusion** ("create and modify 3D models", requires a Fusion subscription) and **SketchUp** connectors, and says Claude Code can "generate parametric models" [vendor claim].

**How MCP works in practice:** Claude reads the scene state, writes `bpy` code, executes it in the live Blender session, then looks at a screenshot or render to check the result. The asset tools add CC0 HDRIs and textures (Poly Haven) and AI-generated base meshes (Rodin, Hunyuan3D, Tripo). Claude orchestrates these tools but does not do the mesh generation itself [code/repo].

### 1b. Claude Code writing and running `bpy` headless

This is a plain loop and needs no MCP: Claude Code writes `gen_asset.py`, runs `Blender -b --factory-startup -P gen_asset.py`, reads the stdout errors and the rendered PNGs, edits the script, and repeats. **[verified locally] on Blender 5.2.2 in `-b` mode:**

- These work: `object.voxel_remesh` (UV sphere → 7,784 verts), `object.multires_subdivide` + apply (→ 31,130 verts), `sculpt.dynamic_topology_toggle`, the Displace modifier, Workbench and EEVEE renders to PNG, and `export_scene.gltf(export_format='GLB')`.
- One iteration (create mesh, sculpt, export) took **1.8 s** of wall time.
- `RegionView3D.update()` crashes in background mode because there is no GPU matrix context. Set `view_location`, `view_distance` and `view_rotation` directly instead.
- The 31k-vertex displaced sphere exported to a **6.7 MB uncompressed GLB**. Plan on decimation plus Draco or meshopt compression for the web.

Another reason to prefer the CLI over MCP for export: one community skill notes that the MCP route can time out on glTF exports and recommends exporting via the headless CLI instead ([unpkg skill](https://unpkg.com/major-ai-skills@2.3.0/skills/blender/SKILL.md)) [community demo].

### 1c. True sculpting via `bpy` versus procedural look-alikes

In the current API (5.2), Sculpt mode exposes `brush_stroke(stroke, mode, brush_toggle, pen_flip, override_location, ignore_background_click)`, `mesh_filter` (types include SMOOTH, INFLATE, RANDOM, RELAX, SPHERE…), `cloth_filter`, `dynamic_topology_toggle`, `detail_flood_fill`, `symmetrize`, mask, face-set and trim operators ([bpy.ops.sculpt](https://docs.blender.org/api/current/bpy.ops.sculpt.html)) [official docs].

**What I found running them headless [verified locally]:**

1. Without setup, `sculpt.mesh_filter` and a `brush_stroke` that hits the mesh **segfault** inside the sculpt undo / original-position code.
2. **Fix:** call `bpy.ops.ed.undo_push()` before and after `mode_set(mode='SCULPT')`.
3. `brush_stroke` fails its context check unless it runs inside `context.temp_override(window, area, region)` aimed at the VIEW_3D window region. `--factory-startup` provides such a region even with `-b` (it reported 1574×954).
4. Each stroke element must carry all 10 fields: `name, location, mouse, mouse_event, pressure, size, x_tilt, y_tilt, time, is_start`. Project the 3D points to `mouse` coordinates with `bpy_extras.view3d_utils.location_3d_to_region_2d`. If the stroke misses the mesh, the operator still returns `FINISHED` but changes nothing.
5. Brushes are assets in 5.x: `bpy.ops.brush.asset_activate(asset_library_type='ESSENTIALS', relative_asset_identifier='brushes/essentials_brushes-mesh_sculpt.blend/Brush/Draw')` returned `FINISHED`.

**What scripting cannot replace [inference]:** pressure and tilt dynamics, stroke-by-stroke visual judgment, and anatomy or gesture. In a script, Claude has to plan each stroke as a 3D polyline it cannot see until it renders. That makes scripting fine for broad forms (inflate, crease lines along a path, symmetrize, smoothing passes). It is poor at faces, cloth folds and stylized character detail. The LL3M paper also notes that spatial edits often take several rounds of follow-up prompts ([LL3M](https://arxiv.org/abs/2508.08228)) [preprint].

**Procedural routes that give sculpted-looking results** (all scriptable, all headless) [inference]:

- Voxel remesh plus Displace with a noise texture (verified above) for rocks and terrain.
- Multires with a baked displacement map.
- Metaballs converted to a mesh, then remeshed and smoothed, for blobby organic primitives.
- The Skin modifier over an edge "skeleton" for creatures and branches.
- Geometry-nodes trees built from Python for repeatable, parameterized variation.
- AI base meshes (Rodin, Hunyuan3D, Tripo via MCP) that Claude then cleans up: remesh, decimate, assign materials.

### 1d. Vision feedback loops and computer use

- **Critique loop:** render N views, send them as images, ask for a diff against the brief, and edit the code. Claude Code's Read tool displays the PNGs directly. Image cost is `ceil(w/28)·ceil(h/28)` visual tokens. A 1920×1080 frame is 2,691 tokens (about $0.011 on Opus 5.5) and a 640×480 frame is 414 tokens (about $0.002) [official docs]. A 20-iteration loop with 4 views at 1080p sends about 215K image tokens, roughly $0.86 at Opus 5.5's input rate. Re-sent history is billed again on later turns unless it is cached [inference].
- **Limits:** "coordinate and localization outputs are approximate" and counts are approximate [official docs]. In LL3M, "VLMs may still struggle to accurately identify spatial artifacts", and that paper used Gemini rather than Claude as the render critic [preprint].
- **Opus 5.5 vision:** Anthropic says it reads charts, diagrams and screenshots more accurately than Opus 5 at every effort level. For dense technical drawings, higher resolution and crop/zoom tools still help (Opus 5.5 migration guide, read via the bundled `claude-api` skill, cached 2026-10-06) [vendor claim].
- **Computer use (driving the Blender GUI):** on the Claude API, every 5.5 model requires the `computer_toolset_20260801` toolset. It adds about 4,500 input tokens per request, and returned screenshots must already fit the model's image limits [official docs]. Anthropic reports OSWorld 2.1 (partial) scores of 81.8% for Opus 5.5 and 80.7% for Fable 5.1 [vendor claim]. **I found no verified public demo of Claude modeling or sculpting by driving Blender's GUI.** Guides describe it only as a visual layer on top of MCP [press]. Prefer MCP or `bpy` over GUI clicking: it is exact, cheaper, and reproducible [inference].

### 1e. 3D without Blender

- **three.js / React-three-fiber code:** Claude writes `BufferGeometry`, `LatheGeometry`, instancing and shader code directly. This is the fastest path for abstract, data-driven or stylized scenes, and the result can live in our repo as TypeScript [inference]. Anthropic's Opus 5.5 page says it scored highest of the Claude models on "graphics and polish" when each built a game from one prompt [vendor claim]. Design Arena's crowd-voted "3D Design" board could not be read directly. Two aggregators disagree: one puts Opus 5 first at 1391 Elo (Aug 2026), the other puts Fable 5 first at 1368 (Jul 2026). Neither lists any 5.5 model ([modelgrep](https://modelgrep.com/best/3d/anthropic), [The Vibe Father](https://thevibefather.com/benchmarks/sources/design-arena)) [press, unverified against source].
- **OpenSCAD / CadQuery (CAD):** good for mechanical, dimensioned parts. In ModelRift's 2026-09-12 test, six Claude Opus 5 agents in Claude Code built three parts in each tool. The CadQuery helical thread silently lost its core cylinder (7,065 mm³ instead of 10,323 mm³) while reporting success, and OpenSCAD accepted a non-manifold mesh. The takeaway: always validate volume and manifoldness externally ([summary](https://zeli.app/story/49676577)) [press; original post not found]. BenchCAD reports that frontier models get the coarse shape right but miss the parametric structure [press, paper not verified].
- **SDF / raymarch shaders and procedural meshes:** Claude can write GLSL SDFs (smooth-union blobs look "sculpted") or marching-cubes code. SDF shaders render in the browser but do not produce a mesh or GLB unless you add a mesher [inference].

## 2. Evidence on Claude for 3D, Blender and spatial tasks

| Evidence | Model | Finding | Quality |
|---|---|---|---|
| [BlenderGym](https://arxiv.org/abs/2504.01786), CVPR 2025: 245 Blender editing tasks (placement, lighting, material, blend shape, procedural geometry) | Claude 3.5 Sonnet | Worse than GPT-4o on every end-to-end metric, and far behind a human Blender user. Best VLM *verifier*: alignment 0.66 vs 0.79 human-to-human | Peer-reviewed; stale model |
| [LL3M](https://arxiv.org/abs/2508.08228), Aug 2025: multi-agent system writing Blender code | Claude 3.7 Sonnet as the coder; GPT-4o planner; Gemini critic | Produces modular, editable assets; some flaws survive auto-refinement | arXiv preprint; stale model |
| [Opus 5.5 launch](https://www.anthropic.com/claude-opus-5-5), 2026-09-22 | Opus 5.5 | Coding, computer use and chart benchmarks (table below); no 3D benchmark | Vendor claim |
| [Blender Lab examples](https://www.blender.org/lab/mcp-server/) | Model not stated | Scene analysis works but missed non-viewport modifiers | Official docs, anecdotal |
| [blendermcp.org Opus 5.5 guide](https://blendermcp.org/guides/claude-opus-5-5-blender) | Opus 5.5 | Explicitly "not published our own Blender test of Opus 5.5" | Community; promotes a paid product |
| ModelRift CAD test | Opus 5 | Silent geometry failures in both CAD tools | Press summary |
| Viral Blender MCP demos (2025 onward); a gihyo.jp cat-model tutorial | Various | Scenes built from prompts | Community demos, not opened |

## 3. Model choice for 3D work

Prices from the official [pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [models](https://platform.claude.com/docs/en/about-claude/models/overview) pages, read 2026-10-17. All four models have 1M context, 128K max output, vision and tool use; computer use works through the toolset above [official docs].

| Model (ID) | Input / output per MTok | Cache read | Default effort | Latency | Role for 3D |
|---|---|---|---|---|---|
| Fable 5.1 (`claude-fable-5-1`, released 2026-09-01) | $10 / $50 | $0.25 | high | Slower | Escalation only: hard procedural systems when Opus 5.5 fails |
| Opus 5.5 (`claude-opus-5-5`, 2026-09-22) | $4 / $20 | $0.20 | medium | Moderate | Planner and author of generator scripts; strongest visual reader |
| Sonnet 5.5 (`claude-sonnet-5-5`, 2026-09-28) | $2 / $10 | $0.10 | high | Fast | Iteration loop: tweak, render, critique |
| Haiku 5.5 (`claude-haiku-5-5`, 2026-10-07) | $0.10 / $0.50 (≤100K-token prompt); $0.50 / $2.50 above | $0.01 / $0.05 | medium | Fastest | Bulk chores: batch export, renaming, GLB stats checks, variants |

Note: the `claude-api` skill cache (2026-10-06) lists Sonnet 5.5 cache reads at $0.20. The official page says $0.10, because Anthropic halved it when Haiku 5.5 launched.

Anthropic's launch numbers, including OpenAI's GPT-6 Astra (Opus 5.5 run at max effort; Astra figures "as reported by OpenAI") [vendor claim]:

| Benchmark | Opus 5.5 | Fable 5.1 | Opus 5 | GPT-6 Astra |
|---|---|---|---|---|
| Terminal-Bench 4.0 | 66.4% | 55.8% | 52.3% | 57.9% |
| FrontierCode v1.1 (Main) | 54.4% | 50.3% | 48.0% | 53.3% |
| AutomationBench | 40.0% | 31.4% | 26.9% | 41.4% |
| Terminal-Bench-Science 0.1 | 58.7% | 52.6% | 29.0% | 64.6% |
| Humanity's Last Exam (with tools) | 67.7% | 65.6% | 63.6% | 57.2% |
| OSWorld 2.1 (partial) | 81.8% | 80.7% | 74.0% | — |
| Chartography (with tools) | 89.0% | 88.4% | 83.4% | — |

What Anthropic says about the smaller models [vendor claim]:

- **Sonnet 5.5** is "close to Opus 5.5 in computer use and chart recognition" and is "the first Sonnet model to beat Pokémon Red working only from screenshots". I could not attribute its table numbers to columns reliably, so I report it qualitatively.
- **Haiku 5.5** scores 72.4% on the OSWorld 2.1 offline subset. Anthropic says it "pairs well … as a subagent" and that Sonnet 5.5 and Opus 5.5 "remain better choices for complex agentic coding".

**Practical guidance [inference]:**

- Planning and writing the scene generator: Opus 5.5 at `high`.
- Iterating: Sonnet 5.5 at `medium`, or Opus 5.5 at `low`/`medium` when the critique hinges on fine visual detail.
- Watch Haiku 5.5's price cliff: screenshot-heavy histories pass 100K tokens fast, and then its price rises 5x.
- API gotchas on the 5.5 models: forced `tool_choice` returns a 400 (use `auto` with `strict: true`); thinking cannot be disabled on Opus 5.5; keep the history append-only [official docs].

## 4. Recommended workflow for our team

1. **Pick the path by asset type.** Abstract, stylized or data-driven assets: Claude writes three.js code straight into `frontend/src/app/`, with no GLB. Organic or "sculpted" hero assets: headless Blender script, then GLB. Mechanical parts: CadQuery, then STL, then a Blender import and GLB. Fine sculpt detail: a human, or MCP against a live Blender session with Claude watching.
2. **Repo layout (proposal):** generator scripts in `tools/blender/gen_<asset>.py`, assets in `frontend/public/models/<asset>.glb` (Angular already copies everything in `public/`, per `angular.json`), and previews in the scratchpad or a gitignored folder.
3. **Loop inside Claude Code:** start with `claude --model claude-opus-5-5`. Prompt: "Write `tools/blender/gen_rock.py`. Run `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/gen_rock.py -- --out frontend/public/models/rock.glb --preview <dir>`. Render 4 views at 1024 px, Read them, critique them against the brief, and iterate at most 5 times." Each script should:
   - push an undo step before any sculpt op;
   - apply modifiers;
   - decimate to a polygon budget;
   - export GLB with `export_apply=True`;
   - print the vertex count and file size.
4. **Validate before committing:** watertight and volume checks for CAD parts; a size budget for GLBs. Teammates on Windows need their own Blender path, so read it from a `BLENDER` env var.
5. **Load the GLB in ThreeScene.** Use `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`. For compressed files, add `DRACOLoader` (decoder files in `node_modules/three/examples/jsm/libs/draco/` must be copied into `public/`) or the meshopt decoder (no extra files) [code/repo]. Dispose the loaded geometries and materials in `DestroyRef.onDestroy`.

## Fit with our stack

- **Claude is a dev-time asset author here, not product inference.** Our CLAUDE.md says the product runs on Crusoe Managed Inference. The project skill (§14) does not say whether using Claude inside the product is allowed, so check with the organizers before shipping any Claude-in-the-loop feature [inference].
- **ThreeScene needs one change to show a model.** `three-scene.ts` currently hard-codes an `IcosahedronGeometry`. Loading a GLB needs a model-URL input, the loader, and disposal of the loaded scene graph. It already sits in an `@defer` block, so the loaders join the lazy chunk and do not count against the 500 kB initial budget. GLBs in `public/` are fetched at runtime and are not bundled [code/repo].
- **Everything needed is already installed.** three 0.186.1 ships the GLTF, Draco and meshopt loaders. Blender 5.2.2 is installed on this Mac. No new npm dependency is needed for the GLB path [verified locally].

## Open questions

- Do the Blender Lab server's tools (screenshots, `_for_cli`) match the competitor's list? projects.blender.org returned 403 to my fetch.
- Is the headless undo-push workaround stable across 5.x point releases and on Windows/Linux? I tested macOS only.
- Do event rules allow non-Crusoe models (Claude, Astra) in the shipped product, or only as dev tools?
- Is there any 3D benchmark for 5.x models? I found none: no BlenderGym rerun, and the Design Arena 3D board could not be read directly.
- How do Rodin, Hunyuan3D and Tripo base meshes compare to Claude-scripted procedural meshes in quality and polygon count for our budget? Untested.

## Sources

- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://platform.claude.com/docs/en/models/opus-5-5/migration-guide (read via the bundled `claude-api` skill copy)
- https://www.anthropic.com/claude-opus-5-5
- https://www.anthropic.com/claude-sonnet-5-5
- https://www.anthropic.com/claude-haiku-5-5
- https://www.anthropic.com/news/claude-for-creative-work
- https://github.com/ahujasid/blender-mcp
- https://www.blender.org/lab/mcp-server/
- https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026
- https://digitalproduction.com/2026/04/30/anthropic-funds-blender-ships-claude-connector/
- https://blendermcp.org/guides/claude-opus-5-5-blender
- https://docs.blender.org/api/current/bpy.ops.sculpt.html
- https://unpkg.com/major-ai-skills@2.3.0/skills/blender/SKILL.md
- https://arxiv.org/abs/2504.01786
- https://arxiv.org/abs/2508.08228
- https://zeli.app/story/49676577
- https://modelgrep.com/best/3d/anthropic
- https://thevibefather.com/benchmarks/sources/design-arena
- https://www.designarena.ai/leaderboard
- https://gihyo.jp/article/2025/08/blender-basics-58
- https://digitalproduction.com/2026/04/30/anthropic-funds-blender-ships-claude-connector/
- https://www.unite.ai/anthropic-wires-claude-into-photoshop-blender-and-ableton/
