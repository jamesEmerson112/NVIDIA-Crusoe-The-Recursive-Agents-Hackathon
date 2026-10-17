# GPT-6 Astra for Blender, and getting the results into three.js

*Researched 2026-10-17. Scope: what GPT-6 Astra can do in Blender, how to connect it, and how to ship Blender output into our Angular 22 / three.js r186 `ThreeScene`.*

**Evidence note.** `openai.com/blog/gpt-6-astra`, `openai.com/index/gpt-6-astra/` and the Axios launch story all returned HTTP 403, so I could not read them. Launch facts below come from OpenAI's developer docs (model page, pricing, guides) [official docs], OpenAI's community-forum launch thread, and press write-ups (DataCamp, Decrypt, Vellum) [press]. Labels: [official docs], [code/repo], [vendor claim], [press], [inference]. I did not run Astra or Blender myself. All code below is untested.

## TL;DR

- **Astra (`gpt-6-astra`)** is OpenAI's current flagship: 1.05M context, 128K max output, text+image in / text out, $10 / $50 per 1M tokens (cached $1), and tools (MCP, computer use, hosted shell) only through the **Responses API** [official docs]. It was released 2026-09-03, first to Trusted Access orgs, then API + ChatGPT paid tiers [press].
- **No independent Blender benchmark exists.** The 3D evidence is OpenAI's own BenchCAD number (95.9%) plus social and early-access demos that mostly don't say which toolchain they used. A consistent warning across reports: characters and creatures come out weak, while hard-surface and architecture come out strong [press][vendor claim].
- **Best route for us:** Codex CLI or desktop with `model = "gpt-6-astra"`, connected to the stdio MCP server `mcp-for-blender` (formerly `ahujasid/blender-mcp`, v2.1.9, MIT). It provides `execute_blender_code`, `look` (visual self-check), scene info, and Poly Haven / Sketchfab / Poly Pizza / Hyper3D / Tripo / Hunyuan3D [code/repo]. Calling it from the hosted Responses API needs a Secure MCP Tunnel or an HTTP bridge.
- **The pipeline is Blender 5.2 LTS → GLB → gltf-transform → `GLTFLoader` in `ThreeScene`.** Bake procedural shaders to textures. Applying modifiers is needed for geometry nodes, but it drops shape keys. three.js r186 reads Draco, both meshopt extensions, KTX2/Basis, WebP and AVIF [official docs][code/repo].
- **Rough cost (estimate):** $5–$30 of API tokens for a modest prop or scene session, and $50+ for long scene builds. Using Codex with a ChatGPT plan login draws on the plan's quota instead of per-token billing [press].

## 1. GPT-6 Astra: what matters for 3D work

| Item | Value | Label |
|---|---|---|
| API id / snapshots | `gpt-6-astra` (only the alias is listed) | [official docs] |
| Context / max input / max output | 1,050,000 / 922,000 / 128,000 tokens; knowledge cutoff 2026-04-30 | [official docs] |
| Modalities | Input: text + image (useful for reference images and Blender screenshots). Output: text only, so no native 3D or image output | [official docs] |
| Reasoning | `reasoning.effort` low → max (no `none`). With reasoning on, drop `temperature`/`top_p` | [official docs] |
| Endpoints | Responses, Chat Completions, Batch. The latest-model guide says "tool calling requires Responses", so Chat-Completions-only shims can't drive MCP | [official docs] |
| Responses tools | MCP, computer use, hosted shell, code interpreter, apply patch, skills, web/file search, image generation, tool search | [official docs] |
| Computer use | OpenAI says: "For GPT-6 Astra, we recommend code execution. The `computer` tool remains supported as an alternative." | [official docs] |
| Other surfaces | ChatGPT Work + Codex, Amazon Bedrock, Azure; Zero Data Retention for eligible API customers | [press] |

**Pricing (per 1M tokens)** [official docs]:

| Tier | Input | Cached input | Cache write | Output |
|---|---|---|---|---|
| Standard | $10 | $1 | $12.50 | $50 |
| Batch / Flex | $5 | $0.50 | $6.25 | $25 |
| Fast (formerly Priority) | $20 | $2 | $25 | $100 |
| Standard, prompt >272K input | $20 | $2 | $25 | $75 (applies to the **whole** request) |

For comparison, `gpt-6.1-sol` costs $2 / $10 and `gpt-6-luna` $0.10 / $0.50, with the same 1.05M context [official docs]. Remote MCP calls cost only their tokens, with no per-call fee. Code-interpreter containers cost $0.03–$1.92 per 20-minute session [official docs].

**API rate limits (Standard):** Build 5,000 RPM / 1M TPM. Launch 10,000 RPM / 4M TPM. Grow 15,000 RPM / 40M TPM [official docs].

**ChatGPT access:** OpenAI's launch post (quoted in the forum thread) said rollout started "today for enterprises in our Trusted Access Program", with Plus, Pro, Business and Enterprise "in the coming days". OpenAI staff said Astra usage counts against normal plan allocations [press]. Reported details, none of which I could confirm: an "Astra Pro" variant for Pro, Business and Enterprise; Enterprise access off by default until an admin enables it; Free and Go excluded; Plus caps of about 5–45 messages per 5 hours [press, unverified]. Exploit-creation capabilities are gated separately behind the **Daybreak** program. That is a different thing from Trusted Access [press].

**Benchmarks: vendor numbers vs independent ones.** Every Astra number below is OpenAI-reported at maximum effort, including the Claude comparison figures inside OpenAI's own tables [press, via DataCamp/Vellum].

| Benchmark (relevance) | Astra | Comparison | Notes |
|---|---|---|---|
| BenchCAD (CAD rebuilt from multi-view renders; closest to 3D) | 95.9% | Fable 5.1 84.3%, Sol 83.3% | OpenAI ran the Claude evaluations with "modified evaluation settings" |
| OSWorld 2.0 (computer use) | 72.6%, ~40 min/task | Opus 5 70.2%, Sol 65.7% (~75 min) | Vendor-reported |
| ScreenSpot-Pro (UI grounding) | 92.7% | Fable 5 87.3%, Sol 76.9% | Vendor-reported |
| Terminal-Bench 4.0 | 57.7% or 57.9% (sources disagree) | Fable 5.1 55.8%, Opus 5 52.3% | Vendor-reported |
| FrontierCode 1.1 / DeepSWE v1.1 | 53.3% / 74.1% | Fable 5 53.5% / 69.9% | Roughly tied on FrontierCode |

Independent results: Artificial Analysis Intelligence Index **61.2**, behind Claude Fable 5.1 (65.7) and roughly level with Sol (60.9). GDPval-AA dropped about 80 Elo [press, Decrypt]. ARC Prize found the near-100% ARC-AGI-3 score depends on a costly stateful harness; the standard harness scored about 17–63%. UK AISI found weakened chain-of-thought monitorability. Irregular reported 86 of 226 cyber challenges solved [press, DataCamp]. Astra is OpenAI's first model rated **Critical** for cybersecurity under the Preparedness Framework [press]. In practice, extra safety checks can pause agent runs, and in the API "tasks stop outright" [press].

## 2. Connecting Astra to Blender

### 2a. Blender MCP servers

| Server | Status / license | Blender / Python | Transport | Surface |
|---|---|---|---|---|
| [`ahujasid/mcp-for-blender`](https://github.com/ahujasid/mcp-for-blender) (PyPI `mcp-for-blender`; `uvx blender-mcp` still works) | Active. v2.1.9 (2026-10-06), ~31.4k stars, MIT | Blender ≥3.0, Python ≥3.10, uv | stdio only (`mcp.run()`). The add-on listens on TCP `localhost:9876` and speaks JSON | 9 tools: `execute_blender_code`, `look`, `get_scene_info`, `generate_3d`, `search_assets`, `import_asset`, `get_addon_status`, plus 2 telemetry tools [code/repo] |
| [`PatrykIti/blender-ai-mcp`](https://github.com/PatrykIti/blender-ai-mcp) | **Discontinued** (last release v3.3.0, 2026-05-04), Apache-2.0 | Blender 4.0+ (E2E-tested on 5.0), Python 3.11+ | stdio **or** Streamable HTTP (Docker). Add-on RPC on port 8765 | Goal-first router, macro tools, `scene_measure_*` / `scene_assert_*` checks, vision-assisted comparison [code/repo] |
| [Blender Lab MCP server](https://www.blender.org/lab/mcp-server/) (official) | Add-on v1.0.3 | Blender ≥5.1 | `.mcpb` bundle or from source. Docs examples use llama.cpp | Scene analysis, renaming, docs lookup. Warning: "will execute LLM generated code in Blender without any guards"; run it in a VM [official docs] |

All three run on Blender **5.2 LTS** (5.2.2 is current; blender.org also mentions 5.3, status not verified) [official docs]. `mcp-for-blender` architecture: the MCP server runs as a subprocess of the client (stdio), and the Blender add-on executes the commands it receives in `bpy` on Blender's main thread [code/repo]. The `look` tool returns viewport, camera, multi-angle, wireframe or render images, so the model can check its own work. That depends on Astra's image input. `max_size` keeps image tokens down [code/repo].

**Setup** [code/repo]: run `uvx mcp-for-blender setup`. It installs uv, configures the detected clients (Codex included), and installs and enables the add-on. In Blender, press `N` → **MCP for Blender** → **Start MCP Server**. Run only one client per port, or start more instances with `--port`. A **Codex plugin** adds an inline viewport and Poly Haven / Sketchfab / Poly Pizza pickers (`codex plugin marketplace add ./blender-mcp/integrations/codex`).

**Security** [code/repo][official docs]: the socket has no authentication or encryption. Keep it on `localhost`, or reach it over an SSH tunnel. `BLENDER_MCP_SAFE_MODE=1` limits scripts to bpy, bmesh, mathutils and pure stdlib, with no file, network or process access. Rendering, saving and import/export operators are still **allowed**, so GLB export still works. CVE-2026-10688 (code injection via `execute_blender_code`, NVD CVSS 3.1 score 5.5) is really the tool's designed behavior. NVD says an exploit is public; Feedly says there is no PoC. There is no fixed version because releases are rolling [official docs, NVD/Feedly]. Telemetry: an anonymous usage record is sent by default, and content (prompts, code, screenshots) is opt-in. `DISABLE_TELEMETRY=true` turns everything off [code/repo]. Neural4D's claim that telemetry is "on by default" leaves out that distinction.

### 2b. How Astra reaches the server

| Route | Works with stdio `mcp-for-blender`? | Notes |
|---|---|---|
| **Codex CLI / desktop / IDE** (shared `~/.codex/config.toml`) | **Yes, natively** | Lowest friction. Can sign in with a ChatGPT plan, in which case Astra draws on plan quota [press]. Default `tool_timeout_sec = 60` and `startup_timeout_sec = 10`; raise them for renders and `generate_3d`, which takes 1–3 minutes [official docs][code/repo] |
| **Responses API `mcp` tool** (your own agent or Agents SDK) | Not directly. Needs Streamable HTTP/SSE at a reachable URL | Option A: [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) (`tunnel_id`, outbound-only `tunnel-client --mcp-command "uvx mcp-for-blender"`; limits of 120 s per request, 10 MiB payload, 600 RPM; needs the Tunnels Read+Use role). Option B: an HTTP bridge such as [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) or [supergateway](https://github.com/supercorp-ai/supergateway) behind a public URL. Never expose it without `authorization`, because it is arbitrary code execution [official docs][inference] |
| **ChatGPT (web)** | Through a custom MCP "plugin" with Connection: Tunnel, or an HTTPS endpoint | Governed by workspace permissions. I could not verify that the ChatGPT desktop app supports local stdio servers. The "Settings → MCP servers → STDIO" path in the docs belongs to the *Codex* desktop app. Legacy `connector_id` connectors are deprecated for models released after 2026-09-01 [official docs] |
| **bpy scripts, headless** | No MCP needed | `blender -b --factory-startup scene.blend --python-exit-code 1 -P gen.py -- args` (argument order matters) [official docs]. Deterministic and CI-friendly, but the model is blind unless you feed back logs and rendered PNGs |
| **Computer use on the Blender GUI** | No MCP needed | OpenAI itself recommends code execution over the `computer` tool for Astra [official docs]. One report: an architectural build took about 4 hours and used about half of a $200/month plan [vendor claim]. Slowest and least reliable of the routes |

Minimal Codex config (adapted from the README and Neural4D; untested):

```toml
model = "gpt-6-astra"
model_reasoning_effort = "high"
[mcp_servers.blender]
command = "uvx"
args = ["--python", "3.11", "mcp-for-blender"]
env = { BLENDER_MCP_SAFE_MODE = "1", DISABLE_TELEMETRY = "true", UV_PYTHON_PREFERENCE = "only-managed" }
startup_timeout_sec = 20
tool_timeout_sec = 180
```

## 3. What Astra can and can't reliably do in Blender

| Area | Assessment | Evidence |
|---|---|---|
| Hard-surface / architecture / props from primitives + modifiers | **Good.** Massing models, rooms, vehicles, machinery | Apple Park and Palace of Fine Arts recreations; locomotive with 3,295 components; shrine in about 30 min [press/social, toolchain mostly unstated] |
| Image → editable scene | Promising | Krcha: one house photo → editable interior at 60 fps [press/social]. BenchCAD 95.9% [vendor] |
| Characters / creatures / rigged figures | **Weak.** "Stray considerably from the original designs" and need "exhausting" micro-management | grapeot [press]; Neural4D [vendor claim] |
| Materials | Principled BSDF and Poly Haven textures work. Procedural node looks won't survive glTF unless baked (§4) | README's guidance on looking up nodes by type [code/repo]; [inference] |
| Geometry nodes | Possible through `bpy` node-tree code, but there are no published demos. Export needs applied modifiers | [inference] |
| Rendering / animation | Keyframes and renders work, e.g. an exploded-view video in "a few dozen minutes". Long animation passes time out, so split them into stages | grapeot [press]; README troubleshooting [code/repo] |
| Asset libraries | Poly Haven (CC0, no key), Poly Pizza (key; ~69% CC-BY, so attribution is required), Sketchfab (key), Hyper3D / Tripo / Hunyuan3D (`generate_3d`, keys or paid Premium). Poly Haven downloads block Blender's UI. Imported models arrive at arbitrary scale | [code/repo] |
| Taste | Generic look ("forest-green-heavy palette") unless you specify an art direction. "Does not know what the shot needs to feel like" | MindStudio [press]; Neural4D [vendor claim] |

Evidence quality is low to moderate. Apart from BenchCAD, there are no controlled evaluations; everything else is early-access anecdotes. grapeot also routed code-writing to Grok, which muddies attribution. Treat Astra as a strong scene-assembly and blocking-out assistant, not a finished-asset generator.

## 4. Blender → three.js pipeline

**Export** (Blender 5.2 `bpy.ops.export_scene.gltf`; parameter names verified against the API docs, untested). It can run inside an MCP session through `execute_blender_code`, since safe mode allows export:

```python
bpy.ops.export_scene.gltf(filepath="/abs/frontend/public/models/scene.glb", export_format="GLB",
    export_apply=True,            # bakes modifiers + geometry nodes, but DROPS shape keys
    export_image_format="WEBP",   # 'AUTO' (PNG/JPEG) | 'JPEG' | 'WEBP' | 'NONE'
    export_meshopt_compression_enable=True, export_meshopt_extension="EXT_meshopt_compression",
    export_animation_mode="ACTIONS", export_extras=True, export_lights=False)
```

**What survives** [official docs]: metal/rough PBR from Principled BSDF (base color, metallic in B / roughness in G, normal, emission); unlit; `KHR_materials_*` (clearcoat, transmission+volume, sheen, specular, anisotropy, dispersion, IOR, emissive strength, variants); `KHR_texture_transform` (from Mapping nodes); punctual lights; cameras; custom properties as `extras`; animation (object/bone TRS, shape keys, skinning; actions, active actions, NLA tracks, or scene mode, with sampling); `EXT_mesh_gpu_instancing`. The occlusion map needs a `glTF Material Output` node group.
**What doesn't:** the exporter only builds materials from nodes it recognizes. Procedural textures and arbitrary node graphs need **baking** to images, using Cycles bake as the manual describes. Area lights and World lighting are ignored. UDIMs get split. `export_apply` is needed for modifiers and geometry nodes, but it "prevents exporting shape keys". Geometry-nodes instance export is "experimental" [official docs].

| Feature | Blender 5.2 export | gltf-transform 4.5.1 | three.js r186 `GLTFLoader` |
|---|---|---|---|
| Draco (`KHR_draco_mesh_compression`) | yes | `draco` | `setDRACOLoader` |
| Meshopt (`EXT_` / `KHR_meshopt_compression`) | yes (both) | `meshopt` (EXT; KHR not confirmed) | `setMeshoptDecoder` (both) |
| WebP / AVIF textures | WebP yes | `webp`, `avif` | yes / yes |
| KTX2 Basis (`KHR_texture_basisu`) | **no** | `uastc`, `etc1s`; needs KTX-Software ≥4.4.0 `ktx` CLI | `setKTX2Loader` + `detectSupport(renderer)` |

[official docs][code/repo]. Recommended command: `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress ktx2` (defaults: `--compress meshopt`, `--texture-compress auto`), then `gltf-transform inspect out.glb` [code/repo]. Compress in one place only. Either export uncompressed from Blender and let gltf-transform compress, or keep Blender's meshopt and run `optimize --compress false`. `optimize` also has geometry passes such as `--simplify`; check `optimize -h` before running it on hero assets [code/repo, defaults unverified]. Prefer **meshopt** to Draco: its decoder is a small JS module, and it also compresses animation and morph targets. Use KTX2 where VRAM matters; it needs the transcoder WASM [inference].

**Loading inside `ThreeScene`** (sketch; goes in `init()` after the WebGL2 check and renderer creation):

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const draco = new DRACOLoader().setDecoderPath('decoders/draco/');
const ktx2 = new KTX2Loader().setTranscoderPath('decoders/basis/').detectSupport(renderer);
const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
let model: Object3D | undefined;
loader.loadAsync('models/scene.glb').then((gltf) => { model = gltf.scene; scene.add(model); /* AnimationMixer for gltf.animations */ });
// onDestroy: model?.traverse(o => { if (o instanceof Mesh) { o.geometry.dispose(); /* dispose materials + their textures */ } }); draco.dispose(); ktx2.dispose();
```

Serve the decoders by adding asset globs to `angular.json`, next to the existing `public` glob: `{ "glob": "**/*", "input": "node_modules/three/examples/jsm/libs/draco/gltf", "output": "decoders/draco" }` and the same for `.../libs/basis` → `decoders/basis` (both folders exist in r186) [code/repo]. PBR materials look flat without an environment; add `RoomEnvironment` through `PMREMGenerator`, or load a Poly Haven HDRI [inference].

**Lazy loading:** the loaders are imported by `ThreeScene`, so they land in its `@defer` chunk and don't affect the 500 kB initial budget. GLBs live in `public/models/` and are fetched only when `init()` runs. For several assets, load on demand and keep a `signal` for loading state; the zoneless app needs no zone [inference].

**Hot reload during development** [inference]: a `@persistent` handler on `bpy.app.handlers.save_post` (handler API verified [official docs]) exports the GLB and writes `public/models/scene.version.json` on every Ctrl+S. This runs in the user's own Blender, not under MCP safe mode, which blocks raw `open()`. A dev-only poll in `ThreeScene` fetches that JSON with `cache: 'no-store'` and, when it changes, disposes the old model and reloads `scene.glb?v=…`. Don't rely on `ng serve` watching `public/`; I couldn't verify that. Paid alternative: "ThreeJS Preview" ($19.99) claims auto-export to a three.js viewer on save [vendor claim, untested].

## 5. Recommended workflow for the team

1. **One-time setup (~30–60 min, estimate):** install Blender 5.2 LTS, run `uvx mcp-for-blender setup`, apply the Codex config above, and turn on Poly Haven only. Add the decoder globs and the loader code to `ThreeScene`.
2. **Prompt with constraints:** dimensions in metres, a polygon budget (e.g. <50k triangles per asset), "Principled BSDF only, image textures, no procedural nodes", a named collection per asset, and a reference image if you have one. Ask it to `look` after each major step and report object and triangle counts.
3. **Astra builds in Blender** (one asset per session to stay under the 272K-token price cliff). A human reviews in the viewport.
4. **Export through MCP** with the snippet in §4, into `frontend/public/models/<asset>.glb`. Then run `gltf-transform optimize` and `inspect`.
5. **View in the browser** through `ThreeScene`, using the save-hook hot reload, then commit the optimized GLB.

**Cost (estimates, Standard API pricing):** per turn ≈ cached context × $1/M + new input × $10/M + (output + reasoning) × $50/M. With 60K context, 90% cached, and 3K output tokens, a turn costs about $0.26, so 40 turns ≈ $10. With 150K context and 5K output, a turn costs about $0.54, so 150 turns ≈ $80. Every `look` image adds input tokens (count not published). Crossing 272K input doubles input pricing for that request. Neural4D's anecdotal 56M-token session would cost anywhere from about $56 (all cached) to about $560 (all uncached), before output. **Time:** 15–45 min per prop or room, a few hours for a narrated or animated piece [press: grapeot]. Export and optimize take under a minute.

## Fit with our stack

- `ThreeScene` already has the right lifecycle hooks: `afterNextRender` init, a WebGL2 guard, a `ResizeObserver`, and disposal in `DestroyRef`. Loading a GLB adds three things: loader setup after the renderer exists (`KTX2Loader.detectSupport` needs it), a scene-graph traversal in `onDestroy` that disposes geometries, materials and textures, and `dispose()` calls on the Draco and KTX2 loaders. Today it disposes only one geometry and one material.
- The render loop stays outside change detection. If animated GLBs are added, `AnimationMixer.update(delta)` goes in `setAnimationLoop`.
- three.js r186 (2026-09-24) supports everything Blender 5.2 exports except variants, which needs a plugin. KTX2 is the only format that needs an extra native tool (the KTX-Software `ktx` CLI) on whichever machine runs the optimize step.
- MCP stays a local developer tool. Nothing Blender-related ships to the browser except the static GLB files.

## Open questions

- Will we get Astra through the API (needs an org with access and a budget), or through Codex with a ChatGPT plan, and which plan? Plan caps are unconfirmed.
- Is Secure MCP Tunnel GA or beta, and does our org role allow creating tunnels? Its 120 s request deadline may cut off `generate_3d` and renders.
- Does gltf-transform 4.5.1 write `KHR_meshopt_compression`, or only `EXT_`? EXT is the safe default either way.
- Does `ng serve` (`@angular/build:application`) live-reload on changes to `public/`? If so, polling isn't needed.
- No independent Blender evaluation of Astra exists yet. We should run a 30-minute bake-off on our own prompt before committing (see the companion Claude/Blender file).

## Sources

- OpenAI model page, gpt-6-astra: https://developers.openai.com/api/docs/models/gpt-6-astra ; models overview: https://developers.openai.com/api/docs/models
- OpenAI pricing: https://developers.openai.com/api/docs/pricing ; latest-model guide: https://developers.openai.com/api/docs/guides/latest-model
- OpenAI MCP & connectors: https://developers.openai.com/api/docs/guides/tools-connectors-mcp ; Secure MCP Tunnel: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels ; computer use: https://developers.openai.com/api/docs/guides/tools-computer-use
- Codex MCP docs: https://learn.chatgpt.com/docs/extend/mcp?surface=cli ; Codex repo (v0.163.0, 2026-10-15): https://github.com/openai/codex
- OpenAI community launch thread: https://community.openai.com/t/introducing-gpt-6-astra-the-most-intelligent-and-aligned-model-in-the-world/1394703
- Not readable (403): https://openai.com/blog/gpt-6-astra , https://axios.com/2026/09/03/openai-astra-gpt-6-agi-brockman
- DataCamp (2026-09-03): https://www.datacamp.com/blog/gpt-6-astra ; Decrypt (2026-09-06): https://decrypt.co/377514/openai-gpt-6-astra-review-shockingly-good ; Vellum (2026-09-03): https://vellum.ai/blog/gpt-6-astra-benchmarks-explained
- MindStudio demos (2026-09-05): https://www.mindstudio.ai/blog/gpt6-astra-3d-generation-demos ; grapeot hands-on (2026-09-05): https://yage.ai/gpt-6-astra-3d-modeling-en.html
- ChatGPT limit estimates (seen only as a search snippet): https://www.renascence.io/news/53271/gpt-6-astra-rollout-halves-chatgpt-message-limits-vs-sol
- Neural4D vendor blog (unverified): https://blog.neural4d.com/?p=3634
- mcp-for-blender: https://github.com/ahujasid/mcp-for-blender , https://pypi.org/project/mcp-for-blender/
- blender-ai-mcp: https://github.com/PatrykIti/blender-ai-mcp ; Blender Lab MCP: https://www.blender.org/lab/mcp-server/
- CVE-2026-10688: https://nvd.nist.gov/vuln/detail/CVE-2026-10688 , https://feedly.com/cve/CVE-2026-10688
- Blender 5.2 manual, glTF: https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html ; CLI: https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html
- Blender API: https://docs.blender.org/api/current/bpy.ops.export_scene.html , https://docs.blender.org/api/current/bpy.app.handlers.html
- three.js r186 GLTFLoader: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/GLTFLoader.js
- glTF-Transform: https://github.com/donmccurdy/glTF-Transform , https://gltf-transform.dev/cli
- MCP bridges: https://github.com/sparfenyuk/mcp-proxy , https://github.com/supercorp-ai/supergateway
- ThreeJS Preview (vendor): https://threejspreview.gumroad.com/l/threejspreview
