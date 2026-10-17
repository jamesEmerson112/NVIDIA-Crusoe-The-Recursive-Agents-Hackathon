# Floorplan datasets and formats

Research date: 2026-10-17. Scope: open floorplan datasets, exchange formats and browser parsers, whether real San Francisco floorplans can be used, and the internal JSON we should standardize on for a 3D floorplan demo that may feed an energy model.
Labels: [official docs] [dataset page] [code/repo] [peer-reviewed] [vendor claim] [press] [inference] [measured] (= I downloaded, ran or queried it myself this session).

## TL;DR

- **Use Swiss Dwellings v3.0.0 (Zenodo, CC BY 4.0).** It has about 45k apartments in about 3,100 Swiss buildings, as WKT polygons in metres with +y pointing north. Every window has its own sill elevation and height, and every room has precomputed sun and daylight simulations [dataset page][measured]. Of the open sets, it is the only one with what an energy model needs.
- **Lighter or alternative sources.** Modified Swiss Dwellings (MSD) JSON on Zenodo (CC BY 4.0, 320 MB) [dataset page]. ResPlan (17k plans in metres), but its GitHub page says CC BY 4.0 while its Kaggle page says CC BY-NC-SA 4.0, and it ships as a Python pickle [code/repo][measured].
- **Most famous sets are non-commercial or gated.** CubiCasa5k is CC BY-NC(-SA) and in pixel units. ZInD, LIFULL HOME'S, RPLAN, Structured3D and 3D-FRONT all need an application or agreement, and several are academic-only. None of these can be obtained in time today [code/repo][dataset page].
- **Real SF floorplans are not practical today.** DBI lets you *view* plans in person. Copies need a notarized affidavit from the owner, sign-off from every design professional who stamped the plans, $152 per set, and up to 30 days [official docs]. OSM indoor data in SF covers 37 buildings, mostly transit stations and malls, and no homes [measured].
- **Internal format: a small JSON of levels, rooms, walls and openings in metres, modelled on the Swiss Dwellings entity model.** It feeds the 2D→3D sibling (`floorplan-2d-to-3d.md`) directly. It also gives the energy sibling (`building-performance-simulation.md`) window area, sill and head height, orientation, and floor height.
- **Formats to avoid as the core format:** IFC (heavy WASM parser), IndoorGML 2.0 (conceptual model only so far), IFC5 (alpha). Emit gbXML or HPXML only at the energy step.

## 1. Open floorplan datasets

| Dataset | Size | Annotation; units | Format | License / access | Last update | Use | Energy-useful? |
|---|---|---|---|---|---|---|---|
| **Swiss Dwellings v3.0.0** | 45,176 apartments, ~3,100 buildings, ~370k rooms; ~715k openings | Rooms, walls, railings, doors, windows, fixtures; 2D WKT plus `elevation` and `height`; **metres**; +y north | 932 MB zip: `geometries.csv` 1.09 GB, `simulations.csv` 1.59 GB [measured] | **CC BY 4.0**, direct download [dataset page] | v3.0.0 2023-03-31 | Residential, plus commercial and public parts since v2.0 | **Yes.** Per-window sill and height, north direction, sun/daylight/view simulations, monthly climate normals |
| **MSD** (Modified Swiss Dwellings, ECCV 2024) | 5.3k floor plans, 18.9k apartments | Room polygons, room types, connectivity graph (networkx); derived from Swiss Dwellings | Kaggle v6, 17.4 GB [measured]; Zenodo "MSD JSON" 320 MB, 4,572 geometries [dataset page] | Kaggle **CC BY-SA 4.0** (share-alike); MSD JSON **CC BY 4.0** [measured] | Kaggle 2023-11-07; JSON 2025-10-08 | Multi-apartment residential | Partly. Geometry is in metres; check whether windows survive the conversion |
| **ResPlan** (2025) | 17,000 plans | Walls, doors, windows, rooms, balconies; vector; **metres**; typed room graph | `ResPlan.pkl` (pickle), Croissant JSON-LD; Kaggle 300 MB [measured] | GitHub: data **CC BY 4.0**, code MIT. Kaggle: **CC BY-NC-SA 4.0**. Conflict [code/repo][measured] | Repo and Kaggle 2026-07-28 | Residential, South Asian markets only [code/repo] | Limited. Window positions exist; no heights, single floor |
| **CubiCasa5k** | 5,000 plans, 80+ categories | Polygons in SVG (`id="Wall"`, `"Window"`, `"Door"`, `class="Space Kitchen"`); raster images; **pixels, no scale** [code/repo] | 5.47 GB zip [measured] | Repo LICENSE **CC BY-NC 4.0**; Zenodo record **CC BY-NC-SA 4.0**. Non-commercial either way [code/repo][dataset page] | Zenodo v1.0 2019-03-28 | Residential (Finnish) [peer-reviewed] | No real scale |
| **ZInD** (Zillow) | 1,575 homes, 67,448 panoramas, 2,737 floor plans, 19,403 windows, 48,759 doors | 3D room layouts, windows/doors/openings, 2D floor plans | ~40 GB via Bridge API | Code Apache-2.0. **Data: academic use only**, institutional email required, about 2 weeks for approval, no personal use [code/repo] | Repo 2022-12 | Residential, **US** (20 cities, 12 states) | Yes in principle (windows, layouts), but unobtainable today |
| **LIFULL HOME'S** | 5.31M high-res floor plan images (2015 snapshot); rental tables | Raster JPG plus tabular attributes | TSV + JPG, ~140 GB | **Universities and public research institutes only; companies rejected**; signed consent letter [dataset page] | Page updated 2025-05-27 | Residential, Japan | No vectors |
| **R2V** (Raster-to-Vector, ICCV 2017) | ~870 annotated plans; 100k+ generated vectors (Google Drive) | Wall/door line endpoints, icon boxes, room seed points; **pixels** | Text rows | Repo MIT. Images withheld because they belong to LIFULL; annotations' status unclear [code/repo] | Repo 2022-06 | Residential, Japan | No |
| **RPLAN** | 80k+ plans [code/repo: rplanpy] | Raster room masks | PNG | Google request form, terms shown only via the form [measured: project page] | 2019 | Residential, China | No |
| **Structured3D** | 3,500 scenes (synthetic) | 3D structure, layouts, renderings | Custom JSON + images | **Agreement form + Terms of Use**; code MIT [code/repo] | Repo 2025-02 | Residential (synthetic) | Partly |
| **3D-FRONT** | 6,813 houses, 18,968 rooms [peer-reviewed] | Furnished 3D layouts, walls/doors/windows as meshes; metres | JSON + 3D-FUTURE models | Tianchi licence agreement. The sibling 3D-FUTURE licence is research-only with no commercial use; 3D-FRONT's terms are **not verified** [press] | 2021 | Residential (synthetic) | Partly |
| **WAFFLE** (WACV 2025) | Wikimedia Commons floorplans | Images (some SVG), metadata | CSV + images (SharePoint) | Per-image Commons licences [code/repo] | 2025 | Mixed, worldwide | No |
| **Rent3D**, **FloorPlanCAD** | — | — | — | **Not verified this session** | — | — | — |

**Swiss Dwellings details [measured unless noted].**
- `geometries.csv` columns: `apartment_id, site_id, building_id, plan_id, floor_id, unit_id, area_id, unit_usage, entity_type, entity_subtype, geometry, elevation, height`.
- `entity_type` is one of `area`, `separator`, `opening`, `feature`. Subtypes include `LIVING_ROOM`, `KITCHEN`, `BATHROOM`, `BALCONY`, `WALL` and `RAILING`.
- Walls are thin polygons, not centrelines. Rooms are 2.6 m high by default.
- The dataset page says windows "might start at different elevations and have differing heights", and that many heights are defaults [dataset page].
- Coordinates are in each site's local frame. `locations.csv` holds climate normals and walk-shed counts per building, but **no lat/lon**. So we know orientation (north) but not the absolute location.
- Source: plans from Archilyse AG's commercial clients, manually QA'd [dataset page].

**US / SF coverage.** ZInD is the only large US set, and it is academic-only. I found no open US or SF floorplan dataset. Roboflow hosts small CC BY 4.0 floor-plan detection sets, raster only, with unknown provenance [press].

**ResPlan caution.** Loading a `.pkl` runs arbitrary code. Convert it once in an isolated environment, or use the Kaggle copy (the README says it has the graph pre-populated), which carries the NC licence [code/repo][inference].

## 2. Exchange formats and browser parsers

| Format | What it represents | Who uses it | Browser parser (version, date, license) |
|---|---|---|---|
| **IFC 4.x** (STEP text) | Full BIM: walls, slabs, openings, spaces, property sets | Revit, ArchiCAD, public BIM mandates | `web-ifc` 0.0.78 (2026-09-21), **MPL-2.0**, 24.8 MB unpacked WASM. `@thatopen/components` 3.4.9 and `@thatopen/fragments` 3.4.8 (2026-10-06), MIT, peer `three >=0.182` [code/repo] |
| **IFC5 / IFCX** (JSON) | Next-generation, composable JSON IFC | buildingSMART task force | **Alpha examples only.** The README says "do not create derivatives". Project-plan votes were held in Aug 2026 [code/repo][official docs] |
| **DXF / DWG** | CAD linework: layers, polylines, blocks; no semantics | Every CAD tool; architects' permit sets | `dxf` 5.3.1 (2025-09-01, MIT). `dxf-parser` 1.1.2 (**last release 2021-11**, MIT). `dxf-viewer` 1.0.50 (2026-10-17, **MPL-2.0**, depends on `three ^0.186`). DWG: no permissive browser parser found; convert to DXF offline [code/repo][inference] |
| **SVG (CubiCasa)** | Pixel-space polygons grouped by `id`/`class` | CubiCasa5k | Built-in `DOMParser`; no library needed [code/repo] |
| **Apple IMDF 1.0.0** | Venue, level, unit, opening, fixture as GeoJSON features in WGS84 | Apple Indoor Maps; OGC Community Standard 20-094 (2021) | Plain GeoJSON. Apple says IMDF "conforms to RFC 7946" [official docs] |
| **OGC IndoorGML 2.0** | Indoor cells plus a navigation graph | Research, navigation | Part 1 (conceptual UML) approved 2025-03-10. The GML encoding (Part 2) is not yet published, and I found no JS parser [official docs] |
| **OSM Simple Indoor Tagging** | `indoor=room/area/wall/corridor/door`, `level`, `repeat_on`, `min_level`/`max_level` | OSM mappers, OpenIndoor | Overpass JSON or `osmtogeojson` 3.0.0-beta.5 (2022, MIT) [official docs: OSM wiki][code/repo] |
| **GeoJSON** (RFC 7946) | Lon/lat polygons. Metre-local floorplans break the spec unless you define a local CRS convention | Everyone | Native `JSON.parse` |
| **JSON room/wall graphs** | Rooms as nodes, typed edges (door, adjacency, window) | MSD (networkx), ResPlan, House-GAN-style research | Native JSON. Swiss Dwellings WKT: `@terraformer/wkt` 2.2.2 (2026-06-29, MIT). `wellknown` (2016) is stale. CSV: `papaparse` 5.7.0 (MIT) [code/repo] |
| **gbXML** | Energy-model geometry: Campus/Building/Space/Surface/Opening, plus constructions | Revit and energy tools | XML. `fast-xml-parser` 5.11.2 (MIT). Current schema 8.01 (Jan 2026) per gbxml.org [official docs]. No dedicated JS library found |
| **HPXML** | US residential energy audit data: enclosure areas, window area by orientation, HVAC | BPI standard; OpenStudio-HPXML (NREL/NLR) | XML; same parser. BPI announced v5.0 on 2026-08-28 [official docs: BPI blog]. Simulation runs server-side, not in the browser [inference] |

- MPL-2.0 (`web-ifc`, `dxf-viewer`) is file-level copyleft. Using the packages unmodified is fine; any changes we make to their files must be published [inference].
- IFC 4.3's ISO status was not checked this session.

## 3. Real San Francisco floorplans

- **DBI plan copies [official docs, sf.gov fetched 2026-10-17].**
  - "According to state law, the building owners and design professionals must give permission before we print the building plans."
  - You view the plans in person at 49 South Van Ness and log every stamping professional.
  - The owner signs a notarized affidavit.
  - Fees: $152 per set, plus $10.98 per professional contacted.
  - Professionals have 30 days to respond; silence counts as approval.
- **State law.** The statute is Health & Safety Code §19851. City forms paraphrase it as: inspection only on the department's premises, copies only with owner and professional consent, and use limited to "maintenance, operation, and use of the building". I saw it only through secondary city forms; check leginfo [inference]. Architects' copyright in the drawings would still restrict publishing them [inference].
- **Permit records** (not plan sets) cost $0.10 per page, up to 6 requests per day, through DBI Records Management [official docs].
- **SF Planning Property Information Map / Accela:** not checked this session.
- **Zillow and Redfin floorplan images.** Zillow's terms page blocked my fetch [measured]. Reporting says the terms ban robots and scrapers and ban reproducing content, including photos. The images often belong to agents or photographers [press]. Treat them as off-limits.
- **OSM indoor data in SF [measured, Overpass, approximate SF bbox].**
  - 2,304 `indoor=*` elements. Most are `indoor=no/yes` on amenities.
  - About 580 are real Simple Indoor Tagging (SIT) features: 259 rooms, 143 doors, 74 walls, 54 corridors.
  - These sit in 37 buildings: BART/Muni stations, Salesforce Transit Center, Ferry Building, Japan Center, Kinokuniya, One Market Plaza. **No residential buildings.**
- **Apple and Google indoor maps.** Apple's program is for venue owners and is not an open download [official docs]. I did not check Google's indoor maps.
- **Practical for a one-day demo.** Place open plans (Swiss Dwellings) inside real SF footprints from DataSF `ynuv-fyni`. Or have an agent generate plans constrained by a footprint polygon plus `number_of_stories`. In both cases, label the interiors in the UI as "illustrative, not the real interior" [inference].

## 4. Recommendation

1. **Primary data: Swiss Dwellings v3.0.0.**
   - Download once in a preprocessing script and filter about 5–20 `site_id`s.
   - Write one internal-JSON file per building, probably tens of kB each [estimate].
   - Attribution: "Swiss Dwellings, Archilyse AG, CC BY 4.0".
   - `simulations.csv` sun and daylight values give the energy sibling a sanity check.
2. **Secondary:** MSD JSON (CC BY 4.0) if we want graph or ML examples. ResPlan only after we settle which licence applies and convert the pickle in isolation. CubiCasa5k only for non-commercial visuals, and it needs manual scaling.
3. **Internal shape.** Required fields are unmarked; `?` marks optional fields. Coordinates are metres, x east, y north (the Swiss Dwellings convention). Loading Swiss Dwellings is a near-identity mapping.

```jsonc
{ "id": "sd-site127-b164", "schema": "fp/1", "units": "m",
  "source": { "dataset": "swiss-dwellings-3.0.0", "license": "CC-BY-4.0" },
  "origin?": { "lat": 37.7793, "lon": -122.4193 },  // set when placed in an SF footprint
  "north_deg?": 0,                                  // rotation of +y from true north
  "levels": [{ "id": "L0", "elevation": 0, "height": 2.6,
    "rooms":    [{ "id": "r1", "type": "living", "polygon": [[x,y], ...] }],
    "walls":    [{ "id": "w1", "polygon": [[x,y], ...], "exterior?": true, "thickness?": 0.2 }],
    "openings": [{ "id": "o1", "kind": "window", "segment": [[x,y],[x,y]],
                   "sill": 0.9, "height": 1.4, "wall?": "w1", "rooms?": ["r1"] }] }] }
```

- `type` uses a small fixed vocabulary: living, bedroom, kitchen, bath, corridor, balcony, storage, other. The mapping from each dataset's taxonomy lives in code.
- Topology (which rooms connect through which door) can be derived from `openings[].rooms`, so we don't store a separate graph.
- Window area per facade direction = `segment` length × `height`, grouped by the outward normal rotated by `north_deg`. That is what HPXML and gbXML need [inference].

## Fit with our stack

The frontend is now SvelteKit 3 + Svelte 5, with adapter-node and SQLite via Drizzle. The repo currently has no 3D code.
- **Server side.**
  - Convert Swiss Dwellings CSV to internal JSON in a one-off Node script, or in `src/lib/server/floorplans/`. Never do this in the browser: the CSV is 1.09 GB.
  - Serve the per-building JSON from `static/data/` or through a `+server.ts` route.
  - The Workbench already versions **artifacts with lineage**. A floorplan JSON can be an artifact whose downstream artifacts (3D view, energy inputs, gbXML) go stale when it is edited [inference].
- **Browser parsers.** Load them inside the Svelte component that needs them, with a dynamic `import()` in `onMount`, so they stay out of the initial bundle:
  - `@terraformer/wkt` and `papaparse` are small.
  - `dxf` and `fast-xml-parser` are moderate.
  - `web-ifc` (25 MB WASM) is only worth it if a user uploads an IFC file.
- **3D.** I recommend re-adding **plain `three` 0.186.1** (MIT) inside one `FloorplanView.svelte`. Dynamic-import it in `onMount`, check WebGL2, size from a `ResizeObserver`, and dispose on unmount; the old ThreeScene patterns port directly.
  - Cost: about 560 kB of lazy three.js chunk (the figure from `sf-buildings-3d.md`), plus `MapControls`.
  - The alternative is **Threlte**: `@threlte/core` 8.6.1 and `@threlte/extras` 9.22.2, MIT, peers `svelte >=5` and `three >=0.172` [code/repo]. It is more idiomatic Svelte, but it is another abstraction to learn on hackathon day.
  - A third option is an agent-produced **sandboxed HTML artifact** that loads three from a CDN inside the iframe. That keeps three out of our bundle, but the iframe has an opaque origin, so the plan JSON must be inlined or served with CORS, and the iframe needs CDN access. Keep it as a stretch goal [inference].
- **The SF buildings layer** (`sf-buildings-3d.md`) and floorplans share metre-local coordinates. One SF footprint plus `origin` and `north_deg` places a plan in the city. Swiss plans will not match SF lot shapes, so scale or clip them and label them illustrative [inference].

## Fit with the hackathon

- **Planner** (`openai/gpt-oss-120b`, the repo default; most reliable tool calling): takes a goal such as "show a plausible 3-storey Mission flat and its window-to-wall ratio" and plans the steps.
- **Sub-agents** (fast model, `deepseek-ai/Deepseek-V4-Flash`):
  - Map source room labels to our vocabulary.
  - Pick a Swiss Dwellings site that resembles the SF parcel (by stories, units and area).
  - Generate or adjust a plan to fit a footprint.
  - Draft gbXML or HPXML for the energy sibling.
- **Plain code, not LLM:**
  - CSV, WKT, SVG and DXF parsing.
  - Unit conversion.
  - Extrusion.
  - A **deterministic validator**: rings closed, openings lying on walls, rooms not overlapping, plausible sill and head heights. The agents call it as their "check own progress" step and retry when it fails [inference].
- **Realistic in one day:** preprocess 5–20 Swiss buildings, the JSON schema plus validator, the three.js extrusion view, and one agent loop that picks or adapts a plan and hands window areas to the energy agent.
- **Out of reach today:** real SF interiors, ZInD or LIFULL access, IFC round-tripping.
- **Rate limits:** 30 requests per minute per model without a payment method. Fan out at most a few sub-agents per model and spread roles across models (CLAUDE.md §6).

## Open questions

- Which ResPlan licence governs: GitHub CC BY 4.0 or Kaggle CC BY-NC-SA 4.0? Ask the authors or use the GitHub copy only.
- CubiCasa5k: repo says CC BY-NC, Zenodo says CC BY-NC-SA. Moot unless we use it.
- MSD JSON is CC BY 4.0 but derives from the Kaggle CC BY-SA 4.0 release. Is the share-alike obligation inherited? [inference]
- Does MSD JSON keep windows and doors, or only rooms and graphs? Not checked.
- 3D-FRONT, Rent3D and FloorPlanCAD terms; IFC 4.3 ISO status; Google indoor maps; SF Planning PIM documents: all unverified.
- Which Swiss Dwellings `site_id`s look most like SF stock (3–4 storey multi-unit)? Needs a quick filter on `geometries.csv`.

## Sources

- Swiss Dwellings v3.0.0: https://zenodo.org/records/7788422 ; MSD JSON: https://zenodo.org/records/17294451 ; Neufert 4.0 (derived): https://zenodo.org/records/14223942
- MSD: https://github.com/caspervanengelenburg/msd ; https://www.kaggle.com/datasets/caspervanengelenburg/modified-swiss-dwellings
- ResPlan: https://github.com/m-agour/ResPlan (README, LICENSE) ; https://www.kaggle.com/datasets/resplan/resplan ; paper https://arxiv.org/abs/2508.14006
- CubiCasa5k: https://github.com/CubiCasa/CubiCasa5k (LICENSE, `floortrans/loaders/house.py`) ; https://zenodo.org/record/2613548
- ZInD: https://github.com/zillow/zind ; LIFULL HOME'S: https://www.nii.ac.jp/dsc/idr/en/lifull/ ; terms https://www.nii.ac.jp/dsc/idr/en/lifull/documents/lifull_homes-policy.html
- R2V: https://github.com/art-programmer/FloorplanTransformation ; RPLAN: http://staff.ustc.edu.cn/~fuxm/projects/DeepLayout/index.html ; rplanpy https://pypi.org/project/rplanpy/
- Structured3D: https://github.com/bertjiazheng/Structured3D ; 3D-FRONT: https://tianchi.aliyun.com/specials/promotion/alibaba-3d-scene-dataset , https://arxiv.org/abs/2011.09127 , 3D-FUTURE licence https://terms.aliyun.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202004171628_60052.html
- WAFFLE: https://github.com/TAU-VAILab/WAFFLE ; Roboflow example: https://universe.roboflow.com/construction-platform-workspace/real-floor-plan
- web-ifc: https://github.com/ThatOpen/engine_web-ifc ; That Open components: https://github.com/ThatOpen/engine_components ; IFC5: https://github.com/buildingSMART/IFC5-development ; buildingSMART votes: https://www.buildingsmart.org/tag/approved/
- npm registry (versions, dates, licenses): https://registry.npmjs.org/{web-ifc,@thatopen/components,@thatopen/fragments,dxf,dxf-parser,dxf-viewer,three-dxf,fast-xml-parser,osmtogeojson,@terraformer/wkt,wellknown,wkx,papaparse,three,@threlte/core,@threlte/extras}
- IMDF: https://docs.ogc.org/cs/20-094/ , https://register.apple.com/resources/imdf/ ; IndoorGML 2.0: https://docs.ogc.org/is/22-045r5/22-045r5.html ; OSM SIT: https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging
- gbXML: https://gbxml.org/Schema_Current_GreenBuildingXML_gbXML ; HPXML 5.0: https://bpi.org/blog/2026-08-28/bpi-releases-version-5-0-of-hpxml-transfer-standard/
- SF DBI plan copies: https://www.sf.gov/step-by-step/apply-get-copies-official-building-plans ; records: https://www.sf.gov/requestbuildingrecords ; HSC §19851 summary (Newport Beach form): https://newportbeachca.gov/home/showpublisheddocument/2872/635682493202100000 ; statute: https://leginfo.legislature.ca.gov
- Zillow scraping reporting: https://www.inman.com/2021/02/02/zillow-orders-data-company-to-stop-scraping-its-content/
- Overpass API (OSM indoor query, 2026-10-17): https://overpass-api.de/api/interpreter
