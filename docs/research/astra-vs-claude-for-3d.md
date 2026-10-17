# GPT-6 Astra vs Claude for 3D work: what to use each for

*Researched 2026-10-17. Builds on `gpt-6-astra-blender-threejs.md` and `claude-3d-sculpting.md` (read those for setup details). This file adds head-to-head evidence and turns it into a per-task split for our Angular 22 + three.js 0.186 `ThreeScene`.*

Labels: [official docs] · [vendor claim] (includes every number from a vendor's own launch table) · [independent benchmark] · [benchmark leaderboard, provenance unstated] (a public board that doesn't say who ran the entries) · [code/repo] (source or README) · [press] · [community report] · [inference] (my reasoning). I ran no models for this file.

## TL;DR

- **Use Claude for code in and around the repo.** For debugging `three-scene.ts` and Angular code, use **Opus 5.5**. It has the largest gap of any head-to-head: SWE-bench Multimodal (visual front-end bugs) 70.2% vs Astra's 43.3% [independent benchmark, Vals]. For writing three.js scenes directly, start with **Sonnet 5.5**. On AA-3D, a blind-vote benchmark that builds scenes in **three.js 0.186.0, the same version we use**, Sonnet 5.5 scored 1194, Opus 5.5 1190 and Astra 1165, a statistical tie. Per scene, AA's launch article puts Astra cheapest ($11.62 vs Sonnet's $14.93), even though Claude is cheaper per token [independent benchmark]. Claude is also cheaper for long cached agent loops: cache reads are 5–10x cheaper and there is no 272K-token price cliff [official docs].
- **Use Astra for Blender-side geometry when wall-clock time matters.** That covers hard-surface and CAD-like blockout, reference photo → scene, and render critique. On BenchCAD 2.0 Core (agentic CAD), Astra at max effort scored 0.59 vs Opus 5.5's 0.57, but in about 62 min and $11 per case vs 3.7 h and $28 [benchmark leaderboard, provenance unstated]. It also has a small vision edge [independent benchmark, Roboflow].
- **The idea that "Astra is far ahead of Claude at 3D" is out of date.** It rests on OpenAI comparing against Fable 5.1. On BenchCAD Vision2Code, Opus 5.5 reports 0.962, Sonnet 5.5 0.963 and Astra 0.959 [vendor claims]. On the vote-based boards (AA-3D, Design Arena 3D, WebDev Arena), Opus 5.5 and Sonnet 5.5 tie or beat Astra. BenchCAD Core is a near-tie with Astra slightly ahead.
- **Don't escalate to Fable 5.1 for 3D work.** It is last of the frontier four on AA-3D, BenchCAD Core, Design Arena 3D and WebDev Arena, and it is the most expensive per scene ($32.08) [independent benchmark] + [inference].
- **Neither model does characters or creatures well.** Run the bake-off below with **matched effort (xhigh/max)** before committing. The effort level moves BenchCAD scores more than the choice of model does.

## Head-to-head evidence

| Capability | GPT-6 Astra | Claude | Evidence quality |
|---|---|---|---|
| **three.js scene generation** (AA-3D v1.0: 55 briefs, three.js 0.186.0, blind panel, 2026-10-12) | 1165 Elo, $11.62/scene | Sonnet 5.5 **1194** ($14.93), Opus 5.5 1190 ($20.50), Fable 5.1 1131 ($32.08) | [independent benchmark]. Top four statistically tied. Closest proxy for our repo. Sonnet's Elo and the Astra, Sonnet and Fable costs come from AA's launch article. The Opus and Astra Elo and Opus's cost come via the AlphaSignal summary, which gives different costs ($18.11 Astra, $15.18 Sonnet) |
| **3D design, crowd votes** (Design Arena "3D", Oct 2026) | 1470 (1.6k votes) | Opus 5.5 1481 (807), Sonnet 5.5 1473 (188, under Design Arena's ~200-vote reliability threshold), Fable 5.1 1394 | [independent benchmark, read via aggregator modelgrep]. The live board would not render. A Sept snapshot (Astra 1481, Fable 1423) predates Opus 5.5 |
| **Web app building, votes** (Code/WebDev Arena, Oct 2026) | 1777 | Opus 5.5 **1807**, Sonnet 5.5 xHigh 1768, Fable 5.1 1741 | [independent benchmark, via aggregator llmrun.dev]. Official board returned 403 |
| **Agentic CAD** (BenchCAD 2.0 Core, 100 cases, ≤30 rounds) | max 0.59 ($11, 62 min, 135k tok); xhigh 0.45; high 0.41 | Opus 5.5 max 0.57 ($28, 3.7 h, 1.3M tok); xhigh 0.32; high 0.18. Sonnet 5.5 max 0.41. Fable 5.1 max 0.30 | [benchmark leaderboard, provenance unstated]. Equal at max, but Astra is about 3.5x faster and needs about 10x fewer tokens |
| **Renders → CAD code** (BenchCAD Vision2Code, with tools) | 0.959 | Sonnet 5.5 0.963, Opus 5.5 0.962, Fable 5.1 0.926 | [vendor claim], listed on benchcad.com and not re-graded. Saturated. OpenAI's "Fable 5.1 = 84.3%" used "modified evaluation settings" |
| **Visual front-end bug fixing** (SWE-bench Multimodal, Vals) | 43.3% ($1.81, 7 min) | Opus 5.5 **70.2%** ($4.92, 19 min) | [independent benchmark]. The largest gap in the Vals comparison |
| **Terminal / agentic coding** | Terminal-Bench 4.0: 59.6% (Vals); 57.9% (vendor) | Opus 5.5 65.2% (Vals); 66.4% (vendor) | [independent benchmark] + [vendor claim]. Vibe Code Bench v1.1 (build a web app) is tied: 89.6 vs 90.3 |
| **Creative/design coding games** (GertLabs GBENCH) | "Frontier model by a comfortable margin" | Opus 5.5 ranks 2nd–7th | [community report], one tester. Ran at "high" effort, which the tester says "is likely working against Opus 5.5" |
| **Vision** (Roboflow Vision Evals, updated 2026-10-13) | 83.4% overall (#2 of 63). Detection 82.1, visual reasoning 87.2 | Opus 5.5 82.0% (#3). Detection 74.5, reasoning 83.0; ahead on identification and OCR | [independent benchmark]. Small overall edge to Astra. No render-critique benchmark exists |
| **Spatial control from images** (Vals Robo-bench: robot arm in a physics sim from camera frames) | 23.3% | Opus 5.5 14.6% | [independent benchmark]. Low scores on both. Weak proxy |
| **Computer use / GUI driving** | OSWorld **2.0** 72.6%; ScreenSpot-Pro 92.7% | Opus 5.5 OSWorld **2.1** (partial) 81.8% | [vendor claim]. Different OSWorld versions and task sets, so not comparable. The only independent head-to-head, Vals CUA-bench (games, keyboard and mouse), has Astra at 19.2 vs 14.0. Both vendors steer users to code over GUI clicking |
| **Tool calling / automation** | AutomationBench 41.4% (vendor); AutomationBench-AA 68.5% | Opus 5.5 40.0% (vendor); 69.5% (AA) | [vendor claim] + [independent benchmark]. Tied. No MCP-specific head-to-head: the MCP-Atlas board (updated 2026-04-08) predates both models |
| **General capability** | AA Intelligence Index 53; Vals Index 63.1 | Opus 5.5 58; Vals Index 67.0 | [independent benchmark]. Earlier press quoted 61.2 for Astra on AA, probably an older index version |
| **Long context** | 1.05M window, 922K max input. Above 272K input, the **whole request** costs 2x input and 1.5x output | 1M window at standard price for Opus and Sonnet 5.5. Haiku 5.5 costs 5x above 100K | [official docs]. I found no independent long-context quality head-to-head (MRCR, Fiction.LiveBench) |
| **Price per 1M tokens** | $10 / $50; cache read $1 | Opus 5.5 $4 / $20 (cache $0.20); Sonnet 5.5 $2 / $10 ($0.10); Haiku 5.5 $0.10 / $0.50 | [official docs] |
| **Cost and speed per task** | At max effort, about 27K output tokens and $3.26 per AA index task. Faster wall-clock on most Vals tasks | Opus 5.5 at max: about 119K output tokens and $5.98 per task. 97 tok/s vs Astra's 57, but slower per task (AA "time per task" 784 vs 472, units not stated) | [independent benchmark] (AA via Vellum; Vals). At AA's low effort, Opus is cheaper ($0.55 vs $0.82) |

**How to read this [inference].** Claude costs 2.5x less per token. At max effort, though, Opus 5.5 thinks far longer, so Astra is often cheaper *and* 2–3x faster **per task** (Vals, BenchCAD Core, AA). On the benchmark that matters most for us, AA-3D, the three top models land within about $9 of each other per scene ($11.62–$20.50), with Astra cheapest. In AA-3D's worked example, Astra showed a first page at 6 min and finished at 68 min, while Sonnet 5.5 showed nothing until minute 42 and ran to 2h58m [independent benchmark]. At a one-day hackathon, wall-clock time may matter more than dollars.

**How much to trust each source [inference]:**

| Source | Trust | Reason |
|---|---|---|
| AA-3D | High for our use | Blind panel, attention checks, 1,008 scenes, our exact three.js version. One benchmark, one attempt per task |
| Vals.ai | High | Same harness for both models, standard errors reported. Effort settings not shown |
| Roboflow Vision Evals | Medium | Independent and recent. Measures photos (detection, OCR), not Blender renders |
| BenchCAD 2.0 Core | Medium-low | Most relevant to 3D, but who ran it is not stated. The 0–1 scores are coarse |
| Design Arena / WebDev Arena | Medium | Crowd votes. Read through aggregators, not the live boards |
| Vendor tables (both sides) | Low for cross-vendor comparison | Different harnesses, versions and effort; "modified evaluation settings" |
| Better Stack, MindStudio, GBENCH, social demos | Low | Single tester, informal, often older model versions |

## Corrections and updates to the companion files

New evidence since those files were written changes these points:

- **"No published 3D benchmark for any Claude 5.x model"** (Claude file) and **"no independent Blender benchmark"** (Astra file): two 3D benchmarks now cover the 5.5 models. AA-3D (2026-10-12) puts Blender in its sandbox but scores three.js output. BenchCAD 2.0 Core and Vision2Code list Opus, Sonnet and Haiku 5.5. There is still no Blender-specific evaluation.
- **"BenchCAD 95.9% vs Fable 5.1 84.3%"** (Astra file): this is accurate as an OpenAI claim, but Anthropic now reports Opus 5.5 at 0.962 and Fable 5.1 at 0.926 on the same Vision2Code task [vendor claims].
- **"Reserve Fable 5.1 for when Opus 5.5 stalls"** (Claude file): this doesn't hold for 3D. Fable 5.1 scores below Opus 5.5 on AA-3D, BenchCAD Core, Design Arena 3D and WebDev Arena.
- **"Design Arena lists no 5.5 model"** (Claude file): the October aggregator snapshot shows Opus 5.5 at 1481 and Sonnet 5.5 at 1473.
- **"AA Intelligence Index: Astra 61.2, Fable 5.1 65.7"** (Astra file): the current comparison page shows Astra (max) 53 and Opus 5.5 (max) 58.
- **Third-party mislabels to avoid:** Vellum calls Opus 5.5's 81.8% "OSWorld 2.0", but Anthropic's table says "OSWorld 2.1 (partial)". Vellum also gives Astra's cached input as $1.25, while OpenAI's model page says $1.

## Access, limits and MCP maturity

- **Astra API:** the model page lists rate-limit tiers Build (5,000 RPM / 1M TPM), Launch (10,000 / 4M) and Grow (15,000 / 40M), and no verification requirement [official docs]. It is OpenAI's first model rated **Critical** for cyber. Cyber capability is gated under Daybreak, and extra safety checks can stop agent runs [press].
- **Astra in ChatGPT:** an OpenAI help-center line quoted on 2026-09-08 says "Plus plans include GPT‑6 Astra in ChatGPT Work and Codex", which means not in regular Chat. Pro users see "GPT-6 Pro, powered by GPT-6 Astra" in Chat [community report quoting official docs; Sept 2026, may have changed]. Codex logged in with a ChatGPT plan draws on that plan's quota instead of per-token billing [press].
- **Claude API:** Opus 5.5 and Sonnet 5.5 each get 1,000 RPM / 2M input TPM / 400K output TPM at the Start tier, and 5,000 / 5M / 1M at Build. **Cached reads don't count toward input TPM.** Fable 5.x is much tighter at Start (1,000 / 500K / 100K). Monthly spend caps are $500 at Start and $1,000 at Build. New orgs may start in a lower "Evaluation" tier [official docs]. A freshly created hackathon account could be throttled [inference].
- **Claude plans:** the Opus 5.5 launch raised five-hour limits on Pro, Max, Team and seat-based Enterprise, and added a saved rate-limit reset [vendor claim]. Users report Opus 5.5 plan limits feel much looser than Astra's ("I can use Opus 5.5 for days and not run out of usage and I can't with Astra") [community report].
- **MCP:** on both APIs, MCP works with **remote servers only**. Claude's MCP connector is beta (`mcp-client-2025-11-20`), states "Local STDIO servers cannot be connected directly", and is not ZDR-eligible. OpenAI's Responses `mcp` tool needs a reachable URL or a Secure MCP Tunnel [official docs]. The local stdio `mcp-for-blender` server works natively in **Claude Code / Claude Desktop** and in **Codex**, and Codex also gets an inline-viewport plugin [code/repo]. On the Claude side, Blender's developers built an official MCP connector (Blender 5.1+) that Anthropic lists for Claude [vendor claim]; a reviewer warns it may make "one confident, catastrophic mistake" [press]. For our local route, the two sides are effectively at parity [inference].

## Task-by-task recommendation

| Task | Verdict | Why |
|---|---|---|
| **Scene layout / blockout** (hard-surface, architecture, props in Blender via MCP) | **Either; lean Astra** (max/xhigh) | Equal CAD quality at max (0.59 vs 0.57) at about 3.5x less time and 2.5x less cost per case. Astra's strongest public demos are hard-surface [press]. Opus 5.5 at max is a fine fallback [inference] |
| **Reference photo → editable scene** | **Lean Astra** | Better detection and visual reasoning on Roboflow, plus photo-to-interior demos [press]. Vision2Code is a tie, so the edge is small [inference] |
| **Procedural / geometry nodes** | **Either; Astra if time-bound, Opus 5.5 (max) otherwise** | Closest proxy is BenchCAD Core (parametric programs); there is no geometry-nodes evidence for either. Both need `export_apply=True`, which drops shape keys [inference] |
| **Scripted sculpting** (headless `bpy.ops.sculpt`) | **Either; lean Claude Opus 5.5** | The hard part is the verified undo-push + `temp_override` recipe in our Claude file, which can go into either model's prompt. Lean Claude only because the team's Claude Code loop already runs it. Organic detail is weak for both [inference] |
| **Characters / creatures** | **Neither alone** | Astra characters "stray considerably" [press]; there is no Claude evidence. Use a Rodin/Tripo base mesh plus model-driven cleanup, or a human [inference] |
| **Materials / shaders** (Principled BSDF, bake for glTF) | **Either; use Sonnet 5.5 for cost** | No differential evidence. It's mostly node code, which is cheap to iterate [inference] |
| **Render critique via vision** (`look`) | **Lean Astra; Opus 5.5 close** | Overall 83.4 vs 82.0, detection +7.6, Robo-bench +8.7 [independent benchmark]. AA-3D shows *when* a model looks matters more than which model (below) |
| **Asset sourcing via MCP** (Poly Haven, Sketchfab, `generate_3d`) | **Either; cheapest is Sonnet 5.5 or Haiku 5.5 (<100K prompt)** | Tool calling is tied (AutomationBench-AA 69.5 vs 68.5). The work is search, import and rescale [inference] |
| **Blender → GLB pipeline scripting** (export, gltf-transform, save hook) | **Claude Sonnet 5.5 / Opus 5.5** | Terminal-Bench 4.0 65.2 vs 59.6 [independent benchmark]. The result is a deterministic script you write once and Haiku can rerun [inference] |
| **Direct three.js code** (scenes in `ThreeScene`) | **Claude Sonnet 5.5 first, Opus 5.5 second; Astra a close third** | AA-3D on three.js 0.186.0: 1194 / 1190 / 1165, a statistical tie; Astra was cheapest per scene. Better Stack's single floating-island test went to Astra, but against Fable 5.1, not 5.5 [press] |
| **Debugging three.js / Angular in this repo** | **Claude Opus 5.5** | SWE-bench Multimodal 70.2 vs 43.3 [independent benchmark]. `CLAUDE.md` already encodes our conventions for Claude Code |
| **Long agent loops** (hours, large cached context) | **Claude (Opus or Sonnet 5.5) on cost; Astra when wall-clock binds** | Cache reads $0.20/$0.10 vs $1, no 272K cliff, and cached tokens are exempt from input TPM [official docs]. Astra finishes faster with fewer tokens [independent benchmark] |
| **Cost-sensitive iteration** | **Claude Sonnet 5.5; Haiku 5.5 for chores** | Sonnet 5.5 is 5x cheaper per token than Astra and tied for #1 on AA-3D, though Astra spent fewer dollars per AA-3D scene ($11.62 vs $14.93), so compare cost per finished task. Haiku scores 0.18 on BenchCAD Core even at max, so keep it off geometry. On OpenAI, GPT-6 Sol ($3.46/scene, 1123 on AA-3D) beats Astra on cost [independent benchmark] + [inference] |

**Claude model choice for 3D [inference]:** Opus 5.5 for debugging and generator authoring. Sonnet 5.5 for three.js generation and the iterate-render-critique loop. Haiku 5.5 for batch chores under 100K tokens. **Not Fable 5.1**, which ranks below Opus and Sonnet 5.5 on every 3D board and costs the most. Run geometry work at **xhigh/max**: on BenchCAD Core, Opus 5.5 drops from 0.57 at max to 0.18 at high, and Claude's default effort is medium or high depending on the model [official docs via Claude file].

## How to run a fair bake-off at the hackathon

**Fixed conditions.** Same Blender 5.2.2, same starting `.blend`, and the same pinned `mcp-for-blender` 2.1.9 with `BLENDER_MCP_SAFE_MODE=1`, `DISABLE_TELEMETRY=true`, and an equivalent MCP tool timeout of about 180 s on both clients (Codex: `tool_timeout_sec` in `~/.codex/config.toml`; for Claude Code, check its MCP timeout setting before the run because I did not verify it). Same prompt file, pasted verbatim. Codex with `gpt-6-astra` against Claude Code with `claude-sonnet-5-5` and `claude-opus-5-5`. **Use API keys on both sides**, not plan logins, so cost shows up on both dashboards. **Match effort**: xhigh, or max on both if the budget allows. In Codex, set this with `model_reasoning_effort`. Before the run, confirm that Claude Code offers xhigh/max for the 5.5 models and how to select them. Mismatched effort decides the result by itself (BenchCAD Core: Opus 5.5 0.18 at high vs Astra 0.41 at high). Cap each run at 45 min or 60 turns. Run each pairing once, and twice if time allows, because single runs are noisy [inference].

**Force early looking.** AA-3D found that how early a model first inspects a render predicts its Elo (Spearman 0.82). Top models first look at a median of turn 10–13; weak ones wait 15–40 turns. Detailed scenes won 63% of votes vs 31% for sparse ones [independent benchmark]. Make "call `look` right after the blockout" a prompt rule, and log time-to-first-render.

**Measure:** wall-clock time, dollars (from both dashboards), turns, tool errors, triangle count vs budget, GLB size after `gltf-transform optimize`, whether the GLB loads in `ThreeScene` with zero console errors, and a **blind pairwise vote** by the other three teammates. Hide model names and require at least 30 s per scene, as AA-3D does.

**Five test prompts (each maps to rows above):**
1. *Hard-surface from a photo:* "Model this desk lamp from the attached photo in metres, under 30k triangles, Principled BSDF only, one collection; `look` after the blockout; export `frontend/public/models/lamp.glb`."
2. *Organic via procedural route:* "Build a mossy rock cluster with voxel remesh + Displace, or the Skin modifier, under 40k triangles; bake procedural textures to images; export GLB."
3. *Direct three.js:* "Write an animated low-poly floating island with a day-to-night lighting cycle as a TypeScript module that `ThreeScene` imports, using three 0.186 with no new dependencies, and dispose everything on destroy." This is the Better Stack prompt, so we can compare against it.
4. *Debug in repo:* plant a bug in `three-scene.ts` (e.g., the camera aspect isn't updated in the `ResizeObserver`, or loaded geometries are never disposed). Prompt: "Find and fix the rendering bug; keep `npm test -- --watch=false` green." This is the analog of SWE-bench Multimodal.
5. *Geometry nodes:* "Create a parametric railing generator with exposed length, post spacing and height; apply it and export GLB."

**Scoring sheet** (one row per run; copy into a shared sheet):

| Prompt | Config (model / effort) | Wall-clock | $ (dashboard) | Turns | Turn of first `look` | Tool errors | Triangles / budget | GLB KB after optimize | Loads clean in `ThreeScene`? | Blind votes won |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 lamp | gpt-6-astra / xhigh | | | | | | / 30k | | | |
| 1 lamp | claude-sonnet-5-5 / xhigh | | | | | | / 30k | | | |
| 1 lamp | claude-opus-5-5 / xhigh | | | | | | / 30k | | | |

**Decision rule [inference]:** for each prompt category, a config wins if it takes most of the blind votes *and* loads clean. Break ties on dollars, then on wall-clock time. If Astra wins prompts 1, 2 and 5 while Claude wins 3 and 4, that confirms the split in the TL;DR. If Claude wins everything at xhigh, standardize on Claude Code for one toolchain and one set of permissions, since `CLAUDE.md` and `.claude/settings.json` already exist.

**Budget estimate [inference]:** AA-3D's uncapped runs cost about $12–21 per scene for these three models. A 45-min cap should keep runs below that, so 5 prompts × 3 configurations comes to roughly $75–250. With 4 people running in parallel it takes about 1.5–2 h. Score ties go to whichever was cheaper in your own measurements.

## Open questions

- **BenchCAD 2.0 Core provenance:** I couldn't tell who ran the Claude and Astra rows or with which harness. The page only says entries are added by sending `core_summary.json`.
- **Live boards:** the AA-3D (post-launch), Design Arena 3D and WebDev Arena numbers came from the launch article or aggregators. The live pages returned 403 or were JS-only.
- **AA Intelligence Index:** the comparison page shows Astra at 53, earlier press showed 61.2. Is that an index version change?
- **Missing head-to-heads:** none for MCP tool reliability or long-context quality covering both models. No Blender-specific evaluation of either.
- **Is Astra in Plus Chat yet,** or still Work/Codex only? The data is from September. A rumored "GPT-6.1 Astra" [community report] could change the picture.
- **Account tiers:** are our API orgs above Anthropic's Evaluation tier and on OpenAI's Build tier? Do event rules limit non-Crusoe models to dev-time use? (Open question carried over from the Claude file.)

## Sources

- Vals.ai, Opus 5.5 vs Astra: https://www.vals.ai/comparisons/anthropic_claude-opus-5-5-vs-openai_gpt-6-astra ; benchmark descriptions: https://www.vals.ai/benchmarks
- Artificial Analysis comparison: https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-claude-opus-5-5
- AA-3D launch article (2026-10-12): https://artificialanalysis.ai/articles/aa-3d ; methodology: https://artificialanalysis.ai/methodology/aa-3d ; AlphaSignal summary with per-scene costs: https://alphasignal.ai/news/artificial-analysis-aa-3d-ranks-21-ai-models-by-3d-scenes-they-build
- BenchCAD leaderboard: https://benchcad.com/leaderboard ; org grading policy: https://github.com/BenchCAD-org ; BenchLM Vision2Code: https://benchlm.ai/benchmarks/benchcadvision2code
- Roboflow Vision Evals: https://playground.roboflow.com/models/compare/claude-opus-5-5-vs-gpt-6-astra
- Design Arena 3D via aggregator: https://modelgrep.com/best/3d ; WebDev Arena via aggregator: https://llmrun.dev/benchmark/lmarena-webdev?show=all
- OSWorld 2.0 board (aggregator): https://www.datalearner.com/benchmarks/osworld-2
- Scale MCP-Atlas leaderboard: https://labs.scale.com/leaderboard/mcp_atlas
- Vellum, Opus 5.5 vs Astra (2026-09-23): https://www.vellum.ai/md/blog/claude-opus-5-5-vs-gpt-6-astra
- Better Stack, Kimi vs Claude vs Astra design tasks (2026-09-14): https://betterstack.com/community/guides/ai/kimi-claude-astra-design/
- MindStudio, Opus 5.5 vs Astra real tasks (2026-09-24): https://www.mindstudio.ai/blog/opus-5-5-vs-gpt-6-astra/
- GBENCH post (2026-09-23): https://digg.com/ai/hsmuokzs ; usage-limit discussion: https://digg.com/ai/xhv8gd1b
- OpenAI gpt-6-astra model page: https://developers.openai.com/api/docs/models/gpt-6-astra.md
- OpenAI forum, Plus access: https://community.openai.com/t/clarification-needed-gpt-6-astra-was-announced-for-all-chatgpt-plus-users-but-plus-access-is-currently-limited-to-work-codex/1395038
- Anthropic Opus 5.5 launch: https://www.anthropic.com/claude-opus-5-5
- Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing ; rate limits: https://platform.claude.com/docs/en/api/rate-limits ; MCP connector: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- Anthropic, Claude for Creative Work (Blender connector): https://www.anthropic.com/news/claude-for-creative-work ; Digital Production review: https://digitalproduction.com/2026/04/30/anthropic-funds-blender-ships-claude-connector/
- mcp-for-blender: https://github.com/ahujasid/mcp-for-blender
- Companion files: `docs/research/gpt-6-astra-blender-threejs.md`, `docs/research/claude-3d-sculpting.md`
