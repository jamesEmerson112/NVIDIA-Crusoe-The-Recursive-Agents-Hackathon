# San Francisco buildings in 3D with three.js

Research date: 2026-10-17. Scope: visualizing *existing* SF buildings (housing first) in our Angular + three.js 0.186 frontend.
Labels: [official docs] [dataset page] [code/repo] [vendor claim] [press] [inference] [measured] (= I downloaded or queried the data myself this session).

## TL;DR

- **Base data: DataSF Building Footprints (`ynuv-fyni`)**. It is public domain (PDDL) and has 177,023 footprints. Every footprint has a LiDAR-derived height and a parcel key (`mblr`), so joining housing data is a string match [dataset page][measured].
- **Housing attributes: SF Planning Land Use (`c5ge-t6pj`)** gives residential units per parcel (423,007 units across 139,487 parcels) [measured]. **Assessor roll (`wv5m-vpq2`, roll year 2025)** gives year built, use code, and stories [dataset page].
  - Joins tested: 97.1% of footprints match a land-use parcel; 98.8% of footprint parcel keys match the 2025 roll [measured].
- **Main catch: the heights are old.** Footprint geometry comes from a 2010 Pictometry model [dataset page].
  - The tallest downtown footprint by per-footprint maximum height (`hgt_maxcm`) is 258.5 m, against 326 m in OSM/Overture. Towers built after 2010 are therefore probably wrong or missing [measured][inference].
  - A few footprints on Mount Sutro report median heights of 183–210 m, almost certainly tower or tree artifacts, so clamp outliers [measured][inference].
  - Overture/OSM has fresher heights (95% coverage) but no parcel key. Treat it as a later height patch, not the base layer.
- **Rendering: extrude the footprints ourselves in plain three.js.** Ship a compact binary of footprints (about 10 MB, estimate), extrude and triangulate in a Web Worker, and merge into roughly 1 km chunk meshes. Color by units, year built, or use, and pick buildings with a building-id attribute plus BVH raycasting.
- **Stretch goal: Google Photorealistic 3D Tiles as a backdrop** via `3d-tiles-renderer`. It is allowed with Google's attribution and logo, and 1,000 root requests per month are free [official docs]. Its photogrammetry mesh has no building IDs, so the housing layer must stay our own overlay [inference].

## 1. Data sources

| Source | ID / version | License | Records / size | Freshness | Heights? |
|---|---|---|---|---|---|
| DataSF Building Footprints | `ynuv-fyni` | PDDL 1.0; attribution "City and County of San Francisco" | 177,023 polygons; slim GeoJSON 129 MB raw, 31 MB gzip [measured] | Portal refresh 2026-10-17 (daily); `data_as_of` 2023-09-11 for every row; geometry from 2010 [dataset page][measured] | Yes, on 100% of rows (`hgt_median_m`, plus `gnd_min_m`, `median_1st_m`, `peak_1st_m`) |
| SF Land Use | `c5ge-t6pj` | CC0 1.0 | 153,765 parcel rows | Updated 2026-08-17; quarterly [dataset page] | No. Has `resunits`, `resunits_s` (group quarters), `residentia` (special residential), commercial sq ft |
| Assessor Secured Roll | `wv5m-vpq2` | PDDL | 3.93M rows (2007–2025 rolls); 211,547 in the 2025 roll; 21 MB JSON for 4 columns [measured] | Updated 2026-06-26 | `number_of_stories` only. Also `year_property_built`, `use_code`, `number_of_units` |
| Zoning Districts | `3i4a-hu95` | PDDL | 10,617 | 2026-10-17 | No |
| Height and Bulk Districts | `h9wh-cg3m` (also `usp2-teig`) | Portal lists "Public Domain U.S. Government" (`usp2-teig` lists none) | — | 2026-10-17 | Allowed height limits (`height`, `gen_hght`), not built height |
| Parcels (active and retired) | `acdm-wktn` | PDDL | 236,573 | 2026-10-17 | No |
| Housing Production 2005–present | `xdht-4php` | (not checked) | — | 2026-10-16 | No. Useful for finding post-2010 buildings |
| OpenStreetMap | live | ODbL; requires "© OpenStreetMap contributors" | About 167k buildings in an approximate SF bbox (via Overture) [measured] | Live | Yes. A 2016–2018 import added `height` to about 144k SF buildings from the city LiDAR data [official docs: OSM wiki] |
| Overture Maps buildings | release `2026-09-23.1` | ODbL (because it includes OSM) | 168,262 in an approximate SF bbox; 31 MB GeoParquet [measured] | Monthly-ish releases | 95.3% have `height`. `num_floors` on only 3,197; `subtype` on 12,388 (9,616 residential) [measured] |
| Google Photorealistic 3D Tiles | Map Tiles API | Google Maps Platform ToS | Streamed | Google-managed | Photogrammetry mesh with no per-building attributes |
| Cesium OSM Buildings | Cesium ion | ion ToS; OSM attribution | 350M+ worldwide [vendor claim] | Quarterly [vendor claim] | `height`, or `cesium#estimatedHeight` at 3 m per level |
| Mapbox 3D buildings | Mapbox Streets / Standard | Mapbox ToS; token required | — | — | `height` and `min_height` from OSM [official docs] |
| USGS lidar | `CA_SanFrancisco_1_B23` | No access constraints; caution on critical use | 13.09 billion points; 654 tiles of 1 km² | Flown spring 2023 | Raw points only |

**DataSF footprint details.**
- The description says the footprints are "collapsed from an earlier 3D building model provided by Pictometry of 2010." Shared-wall masses were split along parcel lines [dataset page].
- Height fields are zonal statistics of 50 cm LiDAR grids, in metres:
  - `hgt_median_m`: median height above ground.
  - `gnd_min_m`: NAVD88 ground elevation.
  - `median_1st_m`, `peak_1st_m`: roof surface elevation (median and highest cell).
- So `base = gnd_min_m` and `top = gnd_min_m + hgt_median_m` already give a hilly city without a terrain mesh [dataset page][inference].
- `hgt_median_m` stats [measured]:
  - Median 6.57 m, p95 12.43 m, max 218.4 m.
  - 670 footprints are ≤ 0.5 m tall.
  - 3,314,601 vertices in 181,084 rings.
  - Extent is about 13.5 × 14.1 km.
- Quality caveats from the OSM import review:
  - The median misses the peak of gabled roofs. Trees can inflate heights.
  - In an 87-building survey, about 80% were within 4 m.
  - The wiki gives the LiDAR year inconsistently (2010 vs 2014) [official docs: OSM wiki].
- `mblr` prefixes [measured]: `SF` (172,698 rows), `SM` (3,207; probably neighbouring San Mateo County parcels [inference]), `CN` (1,118; right-of-way per the column description).
- The API host is now `data.sf.gov`; `data.sfgov.org` returns a 301 redirect [measured].
- The bulk `api/geospatial/...?method=export` HEAD request returned `Content-Length: 0`. A SODA query with only the columns we need worked: `/resource/ynuv-fyni.geojson?$select=shape,hgt_median_m,gnd_min_m,mblr&$limit=200000` took about 2 min 17 s [measured].

**Extracting an SF bbox from Overture.**
- CLI [official docs]:
  - Install with `pip install overturemaps`.
  - Then run `overturemaps download --bbox=-122.5155,37.7034,-122.3557,37.8324 -f geoparquet --type=building -o sf.parquet` (bbox order is W,S,E,N).
- DuckDB, which is what I ran:
  - `LOAD spatial; LOAD httpfs; SET s3_region='us-west-2';`
  - Then `SELECT id, height, num_floors, subtype, geometry FROM read_parquet('s3://overturemaps-us-west-2/release/2026-09-23.1/theme=buildings/type=building/*', hive_partitioning=1) WHERE bbox.xmin > -122.5155 AND bbox.xmax < -122.3557 AND bbox.ymin > 37.7034 AND bbox.ymax < 37.8324`.
  - It took 182 s and wrote 31 MB of GeoParquet [measured].
  - Only the row groups inside the bbox are fetched [official docs].

**Housing join.**
- `mblr` minus its `SF` prefix equals Land Use `mapblklot` and Assessor `parcel_number`, e.g. `SF2412011` → `2412011` [measured].
- Land Use warns that some rows group several parcels (`geography_type = multiple_parcels`), so joins need validating [dataset page].
- Condo units carry their own lots on the Assessor roll. Per-building unit counts are therefore safer from Land Use `resunits` than from summing Assessor rows [inference].
- 2025 roll use codes [measured]: `SRES` 155,111; `MRES` 36,278; `COMM*` about 12k; others small.

**Google Photorealistic 3D Tiles.**
- Pricing: Enterprise SKU. 1,000 free per month, then $6.00 per 1,000 (tiering down to $2.40 per 1,000 above 5M) [official docs].
- Billing unit: only root tileset requests count. One root request covers up to 3 hours of tile requests in that session [official docs].
- Quotas: 10,000 root requests per day; 12,000 queries per minute for the renderer [official docs].
- Using your own renderer is explicitly allowed. The renderer must:
  - Send `root.json?key=...`, then append `key` and `session` to every tile request.
  - Collect the `asset.copyright` strings from visible tiles, sort them by frequency, and show them on one line with the Google logo [official docs].
- Google's page lists CesiumJS, Cesium for Unreal/Unity, and deck.gl (≥ 8.9.13). It does **not** list three.js or 3DTilesRendererJS, but the "your own renderer" rules cover them [official docs][inference].
- Restrictions: no pre-fetching or caching beyond `Cache-Control`. No extracting or deriving geometry from the tiles. Overlays are allowed only if they are not traced from the tiles. Hybrid scenes must say which parts are Google data [official docs].

**Cesium, Mapbox, USGS.**
- Cesium ion's free Community plan is "personal and non-commercial use": 15 GB streaming per month, and Google tiles are capped at 1,000 roots per month. The Commercial plan is $149/month [vendor claim]. The tiles can be streamed into three.js with `CesiumIonAuthPlugin` [code/repo]. I did not verify the OSM Buildings asset ID.
- Mapbox needs a token and Mapbox GL JS. I could not verify whether the ToS allows Mapbox tiles in non-Mapbox renderers (two fetches were inconclusive), so I rank it lowest.
- USGS 2023 lidar:
  - Available as EPT at `s3://usgs-lidar-public/CA_SanFrancisco_1_B23/ept.json` and as LAZ on rockyweb [dataset page].
  - The listed LAS classes are 1, 2, 7, 9, 17, 18, 20. There is **no building class 6**, so buildings sit in "unclassified" [dataset page].
  - Good for an offline height refresh (DSM minus DTM per footprint). Too heavy to stream in a hackathon [inference].

## 2. Rendering approaches in three.js

### A. Streaming 3D Tiles (`3d-tiles-renderer`)

- Package `3d-tiles-renderer` 0.5.3 (2026-09-18), Apache-2.0. Peer dependency `three >=0.167` is marked optional, so it is compatible with our 0.186 [code/repo].
- Core loop [code/repo]:
  - `new TilesRenderer(url)`, then `setCamera(camera)` and `setResolutionFromRenderer(camera, renderer)`.
  - Call `camera.updateMatrixWorld(); tiles.update()` before every render.
  - Call `tiles.dispose()` on teardown.
- Google tiles [code/repo]:
  - `tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken, autoRefreshToken: true }))` handles sessions and collects attributions. `tiles.getAttributions()` exists for the credit line. Choosing `autoRefreshToken: true` is my recommendation [inference].
  - `ReorientationPlugin({ lat, lon })` (radians) re-centres and orients the tileset at that point. Check the exact axis convention before aligning our layer [inference].
  - `GlobeControls` and `EnvironmentControls` are bundled.
- Performance [code/repo]:
  - `errorTarget` defaults to 16; raise it to load fewer tiles.
  - When `lruCache` hits `maxSize` or `maxBytesSize`, "no new tiles load", so watch `lruCache.isFull()`.
  - `TilesFadePlugin` and `UnloadTilesPlugin` help with smoothness and memory.
- Overlaying our buildings on Google tiles has costs [inference]:
  - Both layers must share the same ENU origin.
  - Our extrusions will z-fight with Google's meshes; use a translucent overlay or tint.
  - The UI must label which layer is Google and which is DataSF.

### B. Extruding footprints (recommended)

- **Coordinates.** Project at build time with proj4 to UTM 10N (EPSG:32610) and subtract an SF-centre origin. Alternatively, use an equirectangular local tangent plane at about 37.76° N; its scale error is under 0.1% across the city [inference].
  - Map east to +X, north to −Z, and height to +Y.
  - Coordinates within about ±8 km of the origin keep float32 precision sub-millimetre [inference].
- **Geometry.** `ExtrudeGeometry` builds shapes in XY and extrudes along Z, so it needs a −90° X rotation. It also emits non-indexed triangles with UVs, which is too heavy for 177k buildings [code/repo][inference]. Custom extrusion is lighter:
  - Triangulate each roof with `earcut` (3.2.4, ISC) or `ShapeUtils.triangulateShape` [code/repo].
  - Emit two vertices per footprint vertex (bottom and top), two wall triangles per edge, and use an index buffer.
  - Use `MeshStandardMaterial({ flatShading: true })`: three computes face normals in the shader with `dFdx`/`dFdy` (`normal_fragment_begin.glsl.js`), so **no normal attribute is needed** [code/repo].
- **Merging.** `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` exists in 0.186 [code/repo]. Building one indexed buffer per chunk directly in the worker is cheaper than merging 177k small geometries [inference].
  - Use about 1 km grid chunks (roughly 200 meshes), so three's per-object frustum culling works without extra code.
- **Instancing and LOD.** Footprints are unique, so `InstancedMesh` only fits a box-per-building "skyline" mode: 177k × 12 triangles ≈ 2.1M triangles in one draw call, with per-instance colour [inference].
  - `BatchedMesh` (constructor `(maxInstanceCount, maxVertexCount, maxIndexCount, material)`, `setColorAt`, raycast returns `batchId`) is verified in 0.186 [code/repo]. Its per-instance culling cost at 177k instances is untested, so chunked meshes are the safer default [inference].
- **Picking.**
  - Add a per-vertex `aBuilding` id attribute. Raycast with `three-mesh-bvh` (0.9.16, MIT; `computeBoundsTree` per chunk) and read the id from the hit face.
  - Alternative: GPU id-picking with an offscreen render target [inference].
  - Show the building's info by setting a signal; that works fine in a zoneless app.
- **Colouring.**
  - Store a `color` attribute (Uint8 normalized) for units (sequential scale), year built (diverging scale), and `use_code`/`residentia` (categorical).
  - Recolouring means rewriting one attribute, about 10 MB for all of SF. Alternatively, sample a per-building `DataTexture` by id via `onBeforeCompile`, so recolouring only uploads 177k texels [inference].
- **Ground and basemap.**
  - (1) A flat plane plus DataSF land/shoreline polygons: public domain and no tile terms.
  - (2) Raster OSM tiles via `geo-three` or `XYZTilesOverlay`. The OSM tile policy requires visible attribution, a real User-Agent/Referer, and **no bulk pre-fetching or offline use** [official docs].
  - (3) Google 3D tiles as context.
- **Camera.** Use `MapControls` (in `three/addons/controls/`) instead of `OrbitControls`. Clamp `maxPolarAngle` below horizontal, set near and far to about 1 m and 40 km, and add `Fog` to hide the far edge [code/repo][inference].

### C. Library comparison (npm data checked 2026-10-17 [code/repo])

| Library | Version (date), license | What it gives | Fit with our plain-three Angular app |
|---|---|---|---|
| `3d-tiles-renderer` | 0.5.3 (2026-09-18), Apache-2.0 | 3D Tiles streaming, Google/Cesium auth, overlays, globe controls | High. It is three-native; add it only for the Google/Cesium stretch goal |
| `three-mesh-bvh` | 0.9.16 (2026-10-08), MIT | Fast raycasting on big meshes | High. Needed for picking |
| `earcut`, `proj4` | 3.2.4 ISC; 2.22.0 MIT | Triangulation; reprojection | High. Use in the worker and the build script |
| deck.gl | 9.4.0 (2026-09-05), MIT | Extruded `PolygonLayer`, `Tile3DLayer` (Google-listed) | Low. Has its own luma.gl renderer, so it would replace ThreeScene rather than plug into it |
| maplibre-gl | 6.14.0 (2026-10-11), BSD-3 | Basemap plus native `fill-extrusion`; three.js runs via `CustomLayerInterface` sharing the GL context | Medium. Brings a real basemap but a large bundle (28 MB unpacked; minified size not measured) and changes ownership of the camera |
| geo-three | 0.1.15 (2024-10-13), MIT | LOD raster/height map tiles as three meshes | Medium, for a basemap only |
| three-geo | 1.4.5 (2022-06-18), MIT | Terrain from tile services | Low. Stale |

## 3. Recommended hackathon path

1. **Preprocess once.** Write a `scripts/build-sf-buildings` script (Python or Node, run once). Commit its output or produce it at build time.
   - Pull the slim `ynuv-fyni` GeoJSON plus Land Use (`mapblklot`, `resunits`, `resunits_s`, `residentia`, `total_comm`) and the 2025 Assessor roll (`parcel_number`, `year_property_built`, `use_code`, `number_of_stories`).
   - Join on `mblr[2:]`. Keep `SM`/`CN` rows grey or drop them.
   - Project to local metres. Simplify with Douglas–Peucker at 0.5 m: ring vertices fall from 3.31M to 1.82M (1.39M at 1 m) [measured].
   - Quantize to Uint16 at 0.25 m; 14.06 km / 0.25 m = 56,236, which is under 65,535 [measured extent; estimate].
   - Write `public/data/sf-buildings.bin` (ring offsets, quantized vertices, per-building height/base/units/year/use/chunk) plus a small `sf-buildings.json` with the origin, code dictionaries, and attribution text.
2. **Expected sizes and budgets [estimate].** The arithmetic, with E (edges) ≈ unique vertices ≈ 1.64M at 0.5 m and R = 181k rings:
   - Download: 1.64M × 4 B + per-building records (about 2 MB) + offsets (about 0.7 MB) ≈ **9–10 MB raw, about 5–7 MB compressed**, versus 129 MB for the GeoJSON.
   - Triangles: 2E walls + (E − 2R) roofs ≈ **4.6M triangles**.
   - GPU memory: 3.3M vertices × 12 B position + 4 B id ≈ 52 MB, plus indices of 4.6M × 3 × 4 B ≈ 55 MB, so **about 110 MB**. Fine on discrete GPUs; for low-end laptops, fall back to 1 m simplification or a neighbourhood subset.
   - CPU: triangulating about 181k rings in a worker probably takes 1–3 s on a laptop. Untested.
3. **Iterate small first.** Develop against one neighbourhood bbox, then switch to the citywide file.
4. **Stretch goals.**
   - Fix post-2010 heights by spatially matching Overture/OSM buildings, or the Housing Production records.
   - Use `gnd_min_m` to show hills.
   - Add a Google Photorealistic 3D Tiles toggle with attribution and logo.

## 4. Fit with our stack (ThreeScene)

- **Bundle.** `@defer` already keeps three.js (about 560 kB) out of the initial bundle. Load the building layer and its addons (`MapControls`, `three-mesh-bvh`, `3d-tiles-renderer`) with dynamic `import()` inside `init()` so they stay in lazy chunks.
  - The data file lives in `frontend/public/` (served at `/data/...` by the `assets` glob in `angular.json`). Angular's bundle budgets apply to JS/CSS bundles, so the data file should not count against them [code/repo][inference].
- **Loading.** Start the `fetch` with an `AbortController` and parse and extrude in `new Worker(new URL('./sf-buildings.worker', import.meta.url))`. Transfer the finished `ArrayBuffer`s back to the main thread.
  - Guard against the component being destroyed before the async init finishes.
- **Camera and controls.** The current camera has `far = 100` and uses `OrbitControls`. Change them to a metre-scale far plane (about 40 km) and `MapControls`. Keep `setPixelRatio(min(dpr, 2))`.
  - Consider rendering only while the controls are moving (the `change` event plus the damping window) to save laptop GPU [inference].
- **Disposal.** Extend the existing `destroyRef.onDestroy` block with:
  - `abort()` for the fetch and `worker.terminate()`.
  - For each chunk: `geometry.disposeBoundsTree?.()` and `geometry.dispose()`.
  - Shared material and lookup-texture `dispose()`, `tiles?.dispose()`, `controls.dispose()`, `renderer.dispose()`.
  - Also remove the pointer listeners.
- **Reuse.** Keep ThreeScene generic. Pass in a "layer" (an object with `init(scene, camera, renderer)`, `update()`, and `dispose()`) so the SF buildings layer and the Google tiles layer can be swapped [inference].
- **Attribution UI.** Always show "Data: City and County of San Francisco (DataSF)". Add "© OpenStreetMap contributors" if OSM or Overture data is used. Add the Google logo and the sorted copyright line when Google tiles are on.

## Open questions

- Is the LiDAR behind `hgt_*` from 2010 or 2014? The OSM wiki is inconsistent. Read `SF_BldgFoot_2017-05_description.pdf`, which is attached to `ynuv-fyni`.
- How many post-2010 buildings are missing or too short? Spatially diff against Overture.
  - The downtown max `hgt_maxcm` is 258.5 m vs 326 m in Overture.
  - The citywide max of 286 m sits at 254 m ground elevation, which is probably Sutro Tower and not a building [inference].
- The Overture counts use a hand-drawn bbox with strict containment. Buildings crossing the edge are excluded, and a southern sliver may fall outside SF. Clip to the real city boundary for exact counts.
- Can `BatchedMesh` cull 177k instances at 60 fps? This needs a benchmark.
- Mapbox ToS for non-Mapbox renderers: not verified.
- Cesium OSM Buildings asset ID and commercial terms: not verified.
- Should the demo show `resunits` (Land Use) or `number_of_units` (Assessor)? They will disagree for condos and multi-parcel rows.

## Sources

- DataSF Building Footprints metadata: https://data.sf.gov/api/views/ynuv-fyni.json ; dataset: https://data.sf.gov/d/ynuv-fyni
- SF Land Use: https://data.sf.gov/d/c5ge-t6pj ; Assessor roll: https://data.sf.gov/d/wv5m-vpq2 ; Zoning: https://data.sf.gov/d/3i4a-hu95 ; Height and Bulk: https://data.sf.gov/d/h9wh-cg3m ; Parcels: https://data.sf.gov/d/acdm-wktn ; Housing Production: https://data.sf.gov/d/xdht-4php
- OSM SF building height import: https://wiki.openstreetmap.org/wiki/San_Francisco_Building_Height_Import
- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- Overture buildings guide: https://docs.overturemaps.org/guides/buildings/ ; schema: https://docs.overturemaps.org/schema/reference/buildings/building/ ; DuckDB: https://docs.overturemaps.org/getting-data/duckdb/ ; Python CLI: https://docs.overturemaps.org/getting-data/overturemaps-py/
- Google Map Tiles usage and billing: https://developers.google.com/maps/documentation/tile/usage-and-billing ; pricing: https://developers.google.com/maps/billing-and-pricing/pricing ; policies: https://developers.google.com/maps/documentation/tile/policies ; own renderer: https://developers.google.com/maps/documentation/tile/create-renderer ; third-party renderers: https://developers.google.com/maps/documentation/tile/use-renderer
- 3DTilesRendererJS: https://github.com/NASA-AMMOS/3DTilesRendererJS ; USAGE: https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/USAGE.md ; plugin APIs: https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/core/plugins/API.md , https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/three/plugins/API.md
- Cesium OSM Buildings: https://cesium.com/platform/cesium-ion/content/cesium-osm-buildings/ ; ion pricing: https://cesium.com/platform/cesium-ion/pricing/
- Mapbox 3D buildings example: https://docs.mapbox.com/mapbox-gl-js/example/3d-buildings/ ; Mapbox ToS: https://www.mapbox.com/legal/tos
- USGS 2023 SF lidar (NOAA InPort): https://www.fisheries.noaa.gov/inport/item/73386 ; EPT: https://s3-us-west-2.amazonaws.com/usgs-lidar-public/CA_SanFrancisco_1_B23/ept.json ; AWS registry: https://registry.opendata.aws/usgs-lidar/
- MapLibre three.js custom layer: https://www.maplibre.org/maplibre-gl-js/docs/examples/add-3d-model/ (found via search; a sibling URL returned 404 on 2026-10-17) ; CustomLayerInterface: https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/
- npm registry (versions and licenses): https://registry.npmjs.org/3d-tiles-renderer , https://registry.npmjs.org/three-mesh-bvh , https://registry.npmjs.org/@deck.gl/core , https://registry.npmjs.org/maplibre-gl , https://registry.npmjs.org/geo-three , https://registry.npmjs.org/three-geo
- three.js r186 source (local `frontend/node_modules/three`): `src/objects/BatchedMesh.js`, `examples/jsm/utils/BufferGeometryUtils.js`, `src/renderers/shaders/ShaderChunk/normal_fragment_begin.glsl.js`
