# 2D floorplans to 3D in three.js, and interiors inside SF footprints

Research date: 2026-10-17. Scope: turning a 2D floorplan (walls, openings, rooms, stories) into 3D with plain three.js 0.186 in our SvelteKit 3 + Svelte 5 frontend (three.js was removed in the 2026-10-17 switch from Angular and must be re-added), and generating plausible synthetic interiors for DataSF building footprints.
Labels: [official docs] [dataset page] [code/repo] [peer-reviewed] [vendor claim] [press] [inference] [measured] (= I ran it myself this session).

## TL;DR

- **Build the geometry ourselves in plain three.js. No CSG.** Split each wall into box segments around its openings (left and right piers, a lintel, and a sill under windows). A sample 3-story, 45-opening SF flat came to about 1,600 wall triangles, built in about 15 ms [measured].
- **`three-bvh-csg` works but costs more.** It took about 2.8–3.5 ms per opening and produced 60% more triangles than segmenting (2,581). Releases also lag the repo: 0.0.18 is from 2026-02-17 and warns about a deprecated option against `three-mesh-bvh` 0.9.16 [measured][code/repo]. Use it only for non-rectangular openings.
- **Floors and ceilings: `ShapeGeometry`** from room or footprint polygons. three already bundles earcut, so this adds no dependency [code/repo].
- **Labels:** `CSS2DRenderer` adds no dependency but labels show through walls. `troika-three-text` (MIT, 0.8 MB) gives SDF text that walls hide. Start with CSS2D [code/repo][inference].
- **Data shape: copy openPlan3D's JSON.** Walls are centreline `start`/`end` plus `thickness`. Openings sit on a `wallId` at a `position` from 0 to 1. Floors are a list. openPlan3D is MIT and ships an LLM "plan-authoring" skill for this exact format [code/repo].
- **Skip IFC (`web-ifc` and `@thatopen/*`) for the one-day build.** The packages are about 25 MB each (unpacked), `web-ifc` is MPL-2.0, and `@thatopen/components` needs `camera-controls` as a peer. Pascal Editor (MIT, 24.9k stars) needs React Three Fiber, so it is prior art only [code/repo].
- **SF interiors are synthetic.** Get the floor-plate count from `number_of_stories` and the floor height from LiDAR height ÷ stories. Fill each plate with a corridor-plus-rooms template, or a straight-skeleton or treemap subdivision. Label them "Generated layout, not a real plan" [inference].
- **Stack: the `Plan` JSON is a Workbench artifact.** Render it either in a Svelte 5 component running plain three.js (`onMount` plus a dynamic `import()`, recommended), or in a code-owned HTML template inside the sandboxed artifact iframe that loads three from a CDN. Threlte 8.6.1 (MIT, Svelte 5 native) also works, but most of our geometry is imperative anyway [code/repo][inference].
- **Interiors load on click, for one building or one block.** At about 1.6k triangles each, interiors for all 177k footprints come to hundreds of millions of triangles [measured][inference].
- **Raster-to-vector models carry license traps.** CubiCasa5k is **CC BY-NC 4.0 (non-commercial)** and Raster-to-Graph is **GPL-3.0** [code/repo].

## 1. Geometry in plain three.js

**Coordinates.** Work in metres with plan (x, y) mapped to three (x, −z) and +Y up, which matches `sf-buildings-3d.md`. Each story is a `Group` at `y = story × floorHeight`.

**Walls from centrelines.**
- Each wall is a centreline segment with a thickness.
- A clean corner join offsets both sides by ±t/2 and intersects the offset lines of neighbouring walls at shared endpoints (a miter). For T-junctions, trim the abutting wall to the face of the through wall [inference].
- Hackathon shortcut: extend every wall by t/2 at each end and accept the hidden overlap. With opaque flat-shaded materials it is invisible from outside; z-fighting only shows on coplanar faces [inference].

**Openings, three options** (sample building; method below) [measured]:

| Method | How | Wall triangles (45 openings, 27 walls) | Build time | Tradeoffs |
|---|---|---|---|---|
| Segmented boxes | Per wall: piers between openings, a lintel above each, and a sill below each window | 1,608 (134 boxes) | 15 ms | Simplest and exact for rectangles. `BoxGeometry` keeps hidden end faces, so a hand-built strip would use fewer triangles |
| `ExtrudeGeometry` with holes | Elevation `Shape` (length × height) with hole `Path`s, extruded by thickness | 1,156 (27 meshes) | 11 ms | Fewest triangles, one mesh per wall. A door touching the floor is not a hole, so the outline must be notched (I lifted doors 1 mm as an approximation). Non-indexed output with UVs |
| `three-bvh-csg` subtraction | Wall `Brush` minus opening `Brush`es (`Evaluator`, `SUBTRACTION`) | 2,581 | 124–156 ms (2.8–3.5 ms/opening) | Handles any shape (arches, bays). Slowest; run it in a worker or cache the results |

Method:
- Node 24.22 on an Apple M1, a single process (not a browser), two runs.
- The building is 7.6 × 24 m with three stories of 3.0 m. Walls are 0.2 m exterior and 0.1 m interior. Each story has 4 exterior walls and 5 interior walls; windows are 1.0 × 1.5 m at a 0.9 m sill and doors are 0.9 × 2.1 m.
- `three-bvh-csg` has no `exports` field, so Node loaded its UMD `main` along with a second copy of three. Vite resolves `module` (ESM source) for the browser, so that is probably a Node-only artifact [measured][code/repo][inference].

**Floors, ceilings, stories.**
- Use `new ShapeGeometry(shape)` per room polygon, rotated −90° about X. Use the footprint polygon for the slab and ceiling. Twelve triangles covered the floors and ceilings of all 3 stories of a rectangular plate [measured].
- Holes (stair voids, light wells) go in `shape.holes`.
- Stack stories by cloning the per-story group at increasing Y. Light wells, typical of SF, are just footprint holes or notches [inference].

**Materials.**
- Use one shared `MeshStandardMaterial` per surface class: wall, floor, glass (transparent, `depthWrite: false`) and door. Colour rooms by type with a vertex `color` attribute instead of a material per room.
- `flatShading: true` needs no normals, as in the SF layer [code/repo].

**Room labels.**
- `CSS2DRenderer` (`three/addons/renderers/CSS2DRenderer.js`, present in 0.186 [measured]) puts DOM labels on a second overlay `div`. Call `setSize` from the same `ResizeObserver` as the WebGL renderer. Labels are not occluded by walls; fade them by distance or show only the active story [code/repo][inference].
- `troika-three-text` 0.52.5 (2026-07-24, MIT) renders SDF text meshes that walls occlude correctly. It costs 0.8 MB unpacked plus a worker, and each `Text` needs `.sync()` and `.dispose()` [code/repo].

**Cutaway and dollhouse views.**
- (1) Hide the story groups above the selected story. This is the simplest and best UX for "walk the floors" [inference].
- (2) Use a horizontal clipping plane (`renderer.localClippingEnabled = true; material.clippingPlanes = [new Plane(new Vector3(0, -1, 0), cutY)]`) for a section cut at any height [official docs].
- (3) Dollhouse: draw exterior walls with `side: FrontSide`, or hide camera-facing exterior walls by testing the dot product of the wall normal and the camera direction each frame [inference].
- Pascal's demo shows exploded, cut and X-ray modes as the bar to aim for [code/repo].
- Keep `OrbitControls` for a single building. Clamp `maxPolarAngle` and the target to the building's bounding box.

**Performance.**
- Merge per building and per material with `mergeGeometries`, giving about 3–4 draw calls per building (walls, floors, glass, doors) [inference].
- `BatchedMesh` suits a block of interiors when each building must stay pickable or toggleable [code/repo].
- Store a `room`/`wall` id attribute for picking with `three-mesh-bvh`, as in the SF layer.

## 2. Libraries and prior art

Versions are from the npm registry and repo metadata from the GitHub API, both checked 2026-10-17 [code/repo].

| Project | Version (date) | License (from LICENSE / npm) | Status | Fit with our stack |
|---|---|---|---|---|
| `three-bvh-csg` | 0.0.18 (2026-02-17) | MIT | Repo pushed 2026-09-27; 951 stars; peers `three >=0.179`, `three-mesh-bvh >=0.9.7` | Medium. Only for arbitrary openings; lazy-load it |
| `web-ifc` | 0.0.78 (2026-09-21) | **MPL-2.0** (weak copyleft: changes to its files must be shared) | Active (pushed 2026-10-16) | Low for the hackathon: 24.8 MB unpacked, WASM |
| `@thatopen/components` (+ `fragments`) | 3.4.9 / 3.4.8 (2026-10-06) | MIT | Active | Low. Peers `camera-controls` and `three >=0.182`; fragments is 25 MB unpacked. Only if we must read real IFC |
| Floorspace.js | v0.8.0 (2018-06-27); last code commit 2021-08 | 3-clause BSD text in LICENSE.md (GitHub shows NOASSERTION) | Stale. `NREL/floorspace.js` now resolves to `NatLabRockies/floorspace.js` | Low as code (Vue 2-era editor). Its JSON feeds OpenStudio energy models; see the sibling energy doc |
| react-planner | 2.0.6 (2019-11-03) | MIT | Dead; peers React 16 and `three 0.94.x` | None. Idea reference only |
| blueprint3d (furnishup) | npm 0.0.1-1 (2018) | MIT | Last push 2021-01 | None. Idea reference only |
| openPlan3D (laanlabs) | Repo created 2026-02-11 | MIT | Active (pushed 2026-10-16); SvelteKit + three ^0.182 + `three-mesh-bvh`, no CSG dependency | **Schema to copy**, plus an agent skill for authoring plans [code/repo] |
| Pascal Editor (`@pascal-app/*`) | 1.0.4 (2026-10-13) | MIT | 24.9k stars in a year (created 2025-10-16); CLI + MCP server for AI agents | Can't embed: needs React Three Fiber + drei. Prior art for agent-driven building editing |
| `straight-skeleton` | 3.0.0 (2026-03-24) | MIT | CGAL compiled to WASM (2.1 MB unpacked) | Good for corridor spines and hip roofs on footprints |
| Archilogic Floor Plan SDK | 5.6.0 (2026-10-15) | **Commercial**: npm says "according to your license agreement with Archilogic AG" | Active | No: needs an account and token |
| Smplrspace (`@smplrspace/smplr-loader`) | 2.63.1 (2026-10-14) | **Unclear**: no license field on npm; metered "active floor plans" pricing, no free tier found [vendor claim] | Active | No |

**Raster to vector** (if the input is an image):

| Model | License | Notes |
|---|---|---|
| CubiCasa5k (model + dataset) | **CC BY-NC 4.0, non-commercial** [code/repo] | 5k annotated Finnish plans; repo pushed 2026-02 |
| Raster-to-Vector / FloorplanTransformation (Liu et al., ICCV 2017) | MIT [code/repo] | Junction detection + integer programming; last push 2022; old Torch/TF stack [peer-reviewed] |
| Raster-to-Graph (SizheHu) | **GPL-3.0** [code/repo] | Pushed 2026-05 |
| MLSTRUCT-FP (U-Net wall polygons) | MIT (benchmarks repo) [code/repo] | Walls only |
| "Text-to-Vector Conversion for Residential Plan Design" (arXiv 2602.10757, 2026-02) | Paper is CC BY-NC-SA 4.0; no code URL found | Text→vector and raster→vector |
| A vision LLM, prompted to emit our JSON | Depends on the model | Untested. Check `architecture.modality` per Crusoe model (CLAUDE.md §7.1) [inference] |

## 3. Fitting interiors into SF footprints

**Inputs** (see `sf-buildings-3d.md`): the footprint polygon from `ynuv-fyni`, `hgt_median_m`, `gnd_min_m`, and the assessor `number_of_stories`, `use_code` and `year_property_built`, plus Land Use `resunits`.

**Floor plates.**
- `stories = number_of_stories`, or `round(hgt_median_m / 3.2)` if missing or zero [inference].
- `floorHeight = clamp(hgt_median_m / stories, 2.7, 4.5)`. Median height misses gable peaks, so the top story may read short [dataset page][inference].
- Each plate is the footprint inset by half the exterior wall thickness. Apply the same plate to every story unless the use is podium (ground-floor commercial).

**Party walls.**
- `ynuv-fyni` splits shared masses along parcel lines [dataset page], so a footprint edge that coincides (within about 0.3 m) with a neighbour's edge is a party wall.
- Party walls get no windows, and the energy model treats them as adiabatic [inference].

**Layout methods**, simplest first:
1. **Template plans per SF type**, scaled to the plate. All of these templates are my assumptions, not surveyed plans [inference]:
   - **Victorian or Edwardian flats** (`MRES`, 2–3 stories, narrow and deep): one flat per floor. A side corridor runs along one party wall; parlour at the street end, then bedrooms, bath and kitchen at the rear. Add a light-well notch on the long side. The standard SF lot is about 25 × 100 ft [press].
   - **Walk-up apartments** (4–6 stories, `resunits` / stories ≈ 2–6 per floor): a central double-loaded corridor with stair cores; units split evenly along it.
   - **Podium apartments** (post-2000, 5+ stories): ground-floor commercial and lobby, then a double-loaded corridor above.
   - **Small commercial** (`COMM*`): an open plate with a rear service core.
2. **Corridor plus rooms.**
   - Find the plate's long axis using a minimum-area oriented rectangle.
   - Lay a corridor along it, either the polygon's straight-skeleton spine (`straight-skeleton`) or an offset line.
   - Slice the strips on both sides into units, with `resunits / stories` per floor.
   - Clip each rectangle to the plate.
3. **Recursive subdivision or squarified treemaps** (Marson & Musse 2010) to split units into rooms by target area [peer-reviewed]. This is fast and deterministic, and handles irregular footprints after clipping.
4. **Learned generators** (Graph2Plan, House-GAN++, HouseMind, DStruct2Design). These are mostly trained on RPLAN or similar single-family data, and the licenses vary. Too slow to integrate today [inference].

**Honesty in the UI.**
- Show a persistent badge: "Synthetic interior generated from footprint + story count. Not the real floorplan."
- Use dashed or tinted walls in generated mode.
- Never show room areas as facts.
- Real plans are covered in the sibling `floorplan-datasets-formats.md`.

**Feeding the energy model.**
- Compute per-wall azimuth from the centreline direction. Footprints are geographic before projection, so north is known.
- Window area is Σ(w × h) per wall.
- Rooms or units become thermal zones. Add the exterior / party flag per wall and the floor-to-floor height.

## 4. Recommended implementation (SvelteKit 3 + Svelte 5)

**Input JSON** (a subset of openPlan3D, in metres). It is stored as a Workbench artifact version, so it is versioned and has lineage:

```ts
interface Plan { id: string; synthetic: boolean; origin: [number, number]; stories: Story[] }
interface Story { level: number; elevation: number; height: number;
  walls: { id: string; a: [number, number]; b: [number, number]; t: number; exterior: boolean; party: boolean }[];
  openings: { id: string; wallId: string; pos: number; w: number; h: number; sill: number; kind: 'door' | 'window' }[];
  rooms: { id: string; name: string; type: string; polygon: [number, number][] }[] }
```

**Modules.**
- Shared, pure TS (`src/lib/floorplan/`), so the server agent and the browser both import them:
  - `plan.types.ts`
  - `validate-plan.ts`
  - `generate-interior.ts` (footprint → `Plan`)
- Browser-only three code (`src/lib/floorplan/three/`):
  - `build-walls.ts` (segmented boxes, then merge)
  - `build-rooms.ts` (`ShapeGeometry`)
  - `labels.ts` (CSS2D)
  - `viewer.ts`, which exports `mount(host, plan) → { setPlan, setStory, dispose }`. It wraps the layer object from `sf-buildings-3d.md` (`init`, `update`, `dispose`).
- `src/lib/components/FloorplanView.svelte`.

**Three render options:**

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Plain three in a Svelte 5 component (recommended)** | `onMount`: `const { mount } = await import('$lib/floorplan/three/viewer')`, then return a cleanup that calls `dispose()`. Push prop changes with `$effect(() => view?.setPlan(plan))`, with `view` in `$state.raw` | Lazy chunk; never runs during SSR (`onMount` is client-only); the three.js docs map 1:1; story and room state live in runes | We write disposal ourselves |
| B. Threlte (`@threlte/core` 8.6.1, 2026-09-24; `@threlte/extras` 9.22.2) | `<Canvas><T.Mesh geometry={...}/></Canvas>` | MIT; peers `svelte >=5`, `three >=0.172`; 3.35k stars, pushed 2026-10-16; disposes for you; `extras` has `HTML`/`Text` helpers [code/repo] | Another abstraction over geometry we build imperatively; untested with SvelteKit 3 [inference] |
| C. HTML artifact in the Workbench iframe | A **code-owned template** (not LLM-written three code) with the `Plan` in `<script type="application/json">` and an import map for `three` and `three/addons/` (→ `.../examples/jsm/`) on `cdn.jsdelivr.net/npm/three@0.186.1/` | Fits `create_artifact` with no new UI; self-contained and shareable; versioned with lineage | Needs network. With `sandbox="allow-scripts"` and no same-origin, the origin is `null`, so modules load only from hosts sending `Access-Control-Allow-Origin: *` (jsDelivr does [measured]). A self-hosted copy would need that header. The unminified npm build is 2.1 MB (`three.core.js` 1.46 MB + `three.module.js` 0.66 MB) [measured], too heavy to inline in every version |

- **Recommendation:** A for the main view. C is a cheap fallback, or an export the agent can emit today.
- In both cases the LLM only writes `Plan` JSON; geometry code is ours [inference].
- Re-add `three` 0.186.1 + `@types/three` with `npm install` and commit the lockfile, per CLAUDE.md.

**Budget [inference, from measured counts].**
- One building: about 2k triangles and 3–4 draw calls per story set.
- One block of about 40 buildings: about 80k triangles. That is 3–4 draw calls merged, or one `BatchedMesh` per material.
- Both are trivial next to the 4.6M-triangle citywide shell layer.

**Disposal** (the `onMount` cleanup, or iframe unload):
- `renderer.setAnimationLoop(null)`, then `ResizeObserver.disconnect()`.
- `geometry.dispose()`, `material.dispose()`, `disposeBoundsTree?.()`, troika `text.dispose()`.
- Remove the CSS2D overlay `div`, then `controls.dispose()` and `renderer.dispose()`.
- Guard the async `import()` so cleanup that runs before it resolves doesn't leak a renderer.

**One-day build order.**
1. Hand-write a sample `Plan`.
2. Write `build-walls` and `build-rooms`.
3. Add the story toggle and cutaway.
4. Add CSS2D labels.
5. Write `validate-plan`.
6. Write `generate-interior` (template plus corridor) from one real `ynuv-fyni` footprint.
7. Make it an agent tool result rendered by A, or by C as an HTML artifact.
8. Stretch: SF block shell plus click-to-interior, then CSG bay windows.

## Fit with our stack

- **Server/client split.** Crusoe calls stay in `src/lib/server/agent/`. `validate-plan` and `generate-interior` are pure TS with no three import, so they run server-side inside the agent loop. Only the viewer touches WebGL.
- **Workbench lineage.** A "building inputs" form (address, or footprint + stories + use) feeds the `Plan` artifact, which feeds the 3D view (an HTML artifact or a component). Editing the stories marks the plan stale; a cheap patch re-runs `generate-interior` plus one LLM repair, not a full redo.
- **Rendering.** Lazy `import()` from `onMount` keeps three out of the SSR bundle and the initial chunk. IFC and WASM libraries would add megabytes, so keep them out [inference].
- **Patterns carried over from the removed Angular `ThreeScene`:** the WebGL2 check (`three/addons/capabilities/WebGL.js`), a `ResizeObserver` (now also sizing the CSS2D renderer), and full disposal on unmount.
- **SF layer handoff (stretch).** Clicking a building id gives the footprint and its attributes, which `generate-interior` turns into a `Plan`, which the viewer swaps in. Hide that building's extruded shell meanwhile.

## Fit with the hackathon

- **Planner agent** (a reasoning model on Crusoe): the goal is "show me plausible interiors for this block". It splits the block into one task per building and spawns sub-agents.
- **Layout sub-agent** (an LLM, cheap model): it gets the footprint, stories, `resunits`, use code and the template catalogue, and emits `Plan` JSON. Run it on `CRUSOE_FAST_MODEL` (default `deepseek-ai/Deepseek-V4-Flash`, as `subagent.ts` does), with the planner on `CRUSOE_AGENT_MODEL` (default `openai/gpt-oss-120b`). Alternatives are in CLAUDE.md §4.4; confirm IDs with `GET /v1/models`.
- **Validator** (plain code, the agent's self-check). It enforces Sketch2BIM-style rules (arXiv 2510.20838): unique ids, non-zero wall lengths, openings on their wall with `pos·L ± w/2` inside [0, L] (L = wall length), closed non-self-intersecting rooms, rooms inside the plate, and windows only on non-party exterior walls. It returns a violation list, which becomes a repair prompt. After N failures, fall back to the deterministic template generator. This is the "recover from failures" story.
- **Plain code also covers** geometry, triangulation, party-wall detection and rendering. LLMs never touch vertices [inference].
- **Workbench mapping.** The layout sub-agent sits next to `subagent.ts`. Each building's `Plan` is an artifact created with `create_artifact`. Validator violations go back into the tool result, so the repair turn uses the existing loop (max 12 turns).
- **Rate limits.** 30 RPM per model without a payment method, so 40 buildings × (1 draft + 1–2 repairs) needs throttling or several models (CLAUDE.md §6).
- **Realistic in one day:** templates plus the validator plus repair-loop agents for a handful of buildings. Learned generators and raster input are out of scope [inference].

## Open questions

- Does `number_of_stories` include basements or garages? Check it against LiDAR height on a sample.
- What is a good party-wall tolerance for `ynuv-fyni` (edges from the 2010 model)? Not tested.
- How reliable is LLM-emitted JSON across Crusoe models? Not measured; it needs a small eval with the validator.
- Can troika and the CSS2D overlay hold 60 fps with about 200 labels for a block? Not measured.
- Browser CSG timing (as opposed to Node) is not measured.
- Does Threlte 8 work with SvelteKit 3 and Vite 8? Not tested. Will the Workbench iframe get a CSP that blocks CDN imports? Not decided.

## Sources

- three.js r186 (local npm install): `examples/jsm/renderers/CSS2DRenderer.js`, `examples/jsm/utils/BufferGeometryUtils.js`; clipping: https://threejs.org/docs/#api/en/materials/Material.clippingPlanes
- three-bvh-csg: https://github.com/gkjohnson/three-bvh-csg ; https://registry.npmjs.org/three-bvh-csg
- web-ifc: https://github.com/ThatOpen/engine_web-ifc ; @thatopen/components: https://github.com/ThatOpen/engine_components ; https://registry.npmjs.org/@thatopen/components
- Floorspace.js: https://github.com/NatLabRockies/floorspace.js (LICENSE.md)
- react-planner: https://github.com/cvdlab/react-planner ; blueprint3d: https://github.com/furnishup/blueprint3d
- openPlan3D: https://github.com/laanlabs/openPlan3D ; plan-authoring skill: https://github.com/laanlabs/openPlan3D/blob/main/docs/skills/openplan3d-plan-authoring/SKILL.md
- Pascal Editor: https://github.com/pascalorg/editor ; https://registry.npmjs.org/@pascal-app/core
- straight-skeleton: https://github.com/StrandedKitty/straight-skeleton ; troika: https://github.com/protectwise/troika ; earcut: https://github.com/mapbox/earcut
- Archilogic: https://developers.archilogic.com/ ; https://registry.npmjs.org/@archilogic/floor-plan-sdk ; Smplrspace: https://www.smplrspace.com/pricing
- CubiCasa5k: https://github.com/CubiCasa/CubiCasa5k ; R2V: https://github.com/art-programmer/FloorplanTransformation , https://openaccess.thecvf.com/content_iccv_2017/html/Liu_Raster-To-Vector_Revisiting_Floorplan_ICCV_2017_paper.html ; Raster-to-Graph: https://github.com/SizheHu/Raster-to-Graph ; MLSTRUCT: https://github.com/MLSTRUCT/MLStructFP_benchmarks , https://repositorio.uchile.cl/handle/2250/196842 ; r2v-to-plan2scene: https://github.com/3dlg-hcvc/r2v-to-plan2scene
- arXiv: Text-to-Vector 2602.10757 https://arxiv.org/abs/2602.10757 ; Sketch2BIM 2510.20838 https://arxiv.org/pdf/2510.20838 ; DStruct2Design https://arxiv.org/html/2407.15723v1 ; HomeWorld https://arxiv.org/pdf/2606.06390 ; HouseMind https://arxiv.org/html/2603.11640v1 ; Text-to-Layout https://arxiv.org/abs/2509.00543v1
- Marson & Musse 2010, "Automatic real-time generation of floor plans based on squarified treemaps algorithm", Int. J. Computer Games Technology 2010:624817, https://doi.org/10.1155/2010/624817 (citation confirmed via search; full text not read).
- SF 25 × 100 ft lots: https://fougeronarchitectureblog.com/tag/bay-area/
- Threlte: https://github.com/threlte/threlte ; https://registry.npmjs.org/@threlte/core ; jsDelivr three: https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js
- Benchmark script (not in repo): scratchpad `floorplan-2d-to-3d/exp/bench.mjs`.
