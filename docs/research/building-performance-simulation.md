# Building performance simulation for SF buildings

Research date: 2026-10-17. Scope: energy use, daylight and thermal comfort for houses and commercial buildings, limited to what a 4-person team can wire up in one day from floorplans or extruded SF footprints (`ynuv-fyni` + Land Use + Assessor roll, see `sf-buildings-3d.md`).
Labels: [official docs] [dataset page] [code/repo] [peer-reviewed] [vendor claim] [press] [inference] [measured] (= I downloaded, ran or queried it myself this session, on an Apple M1 laptop).

## TL;DR

- **EnergyPlus 26.2.0 (2026-09-30) runs headless on macOS arm64 and is fast enough to call per click.** The official tarball ships an SF weather file. Annual runs with SF weather took 1.2 s for the 1-zone example, 1.5 s for a 2-zone model built from a real SF footprint, and 6.5 s for the DOE small-office prototype (511 m²) [measured].
- **Footprint to model in 0.6 s.** `geomeppy` (MIT) turned a DataSF footprint, its LiDAR height and the Assessor's 2 stories into a 2-zone EnergyPlus model with windows, and it ran first try after two fixes (§4) [measured].
- **Ground truth exists for big buildings.** SF's Existing Buildings Energy Performance Ordinance data (`4ua7-5sfx`, PDDL) has 30,483 building-year rows from 2011–2025 with `site_eui`. 89.5% of the 2024 parcels join to footprint `mblr` keys [measured].
- **The fallback for everything else is a ResStock/ComStock lookup** (CC BY 4.0). The SF slices are 1,587 ResStock dwellings and 18,622 ComStock rows, with median site EUI by building type and vintage [measured].
- **LLMs should pick parameters, not write IDF.** Published LLM-to-EnergyPlus work reports near-perfect results only on narrow, self-built prompt sets and degrades on multi-zone geometry and schedules [peer-reviewed]. Let the LLM fill a JSON parameter schema and let code build and run the model [inference].
- **License flags.** The Ladybug/honeybee stack is **AGPL-3.0**. The CBE web comfort tool is **GPL-2.0** (`pythermalcomfort` is MIT). EPlus-LLM weights are **CC-BY-NC-4.0**. climate.onebuilding.org weather files have **no stated open license**.
- **Org rename.** NREL became the National Laboratory of the Rockies on 2025-12-01. GitHub repos moved to `NatLabRockies/*`, the web domain is `nlr.gov`, and `www.nrel.gov` did not respond today [press][measured].

## 1. Engines and toolkits

| Tool | Version (date) | License | How it runs | Inputs | Annual runtime, small building | Headless on macOS arm64 |
|---|---|---|---|---|---|---|
| EnergyPlus | 26.2.0 (2026-09-30) | BSD-3-style plus clause (4) restricting use of the "EnergyPlus" name for modified versions; GitHub shows NOASSERTION [code/repo] | CLI `energyplus`, C API and bundled `pyenergyplus`; 212 MB arm64 tarball | IDF/epJSON (zones, surfaces, constructions, schedules, loads, HVAC) plus EPW | 1.2–6.5 s on M1 [measured] | Yes, run today [measured] |
| OpenStudio SDK | 3.11.0 (2026-01-15) | BSD-3-style plus "same designation" clause [code/repo] | CLI, Ruby/Python bindings (`pip install openstudio` 3.11.0), measures | OSM model; drives EnergyPlus and Radiance | EnergyPlus time plus translation (not measured) | arm64 dmg/tar published [code/repo]; not run |
| ladybug-core / honeybee-energy / honeybee-radiance | 0.44.62 (2026-09-22) / 1.126.4 (2026-10-16) / 1.66.296 (2026-10-05) | **AGPL-3.0** [code/repo] | Python libs and CLI; honeybee-energy calls OpenStudio/EnergyPlus, honeybee-radiance calls Radiance | HBJSON rooms and apertures, EPW | Engine-bound | Pure Python [inference]; not run |
| Radiance | daily mirror build `rad6R0P2` (2026-02-02) | Radiance Software License 2.0 (BSD-style) [code/repo] | CLI; `OSX_arm64` pkg/zip on the release | Scene geometry, materials, sky from EPW | Annual daylight takes minutes to hours depending on sensor grid [inference] | Build published [code/repo]; not run |
| eppy / geomeppy | 0.6.7 (2026-08-26) / 0.12.2 (2026-03-13) | MIT [code/repo] | Python IDF editing; `add_block` extrudes a footprint into zones | Energy+.idd plus a base IDF | Model build 0.6 s [measured] | Yes; pip install took 49 s [measured] |
| URBANopt CLI | 1.3.0 (2026-06-29) | BSD-style (Alliance for Energy Innovation) [code/repo] | Ruby/OpenStudio CLI over a GeoJSON FeatureFile of footprints | Footprint, building type, floor area, stories | Per building about an OpenStudio run [inference] | `Darwin.dmg` published [code/repo]; not run |
| LBNL CityBES | web platform (EnergyPlus inside) | Web service; terms not checked | Browser | City building stock | — | `citybes.lbl.gov` returned HTTP 503 today [measured] |
| pythermalcomfort | 4.6.2 (2026-10-15) | MIT [code/repo] | Python: PMV/PPD, adaptive, SET, UTCI | Air temp, MRT, air speed, RH, met, clo | ms per call; first import took about 12 s [measured] | Yes [measured]: PMV −0.37, PPD 7.8% at 22 °C, 50% RH, 0.7 clo |
| CBE Thermal Comfort Tool | web app at comfort.cbe.berkeley.edu (up today) | Repo `comfort_tool` is **GPL-2.0** [code/repo] | Browser | Same as above | Instant | Use the website, or the MIT library in code |
| NREL BuildingsBench | v2.0.0 (2024-11-07) | Code BSD-3-Clause; data "CC-4.0" per the NeurIPS supplement [code/repo][peer-reviewed] | PyTorch models plus Buildings-900K (about 110 GB of Parquet) | Past hourly load plus metadata | — | Short-term load forecasting; **not** a geometry-to-EUI surrogate [peer-reviewed] |
| `@idfkit/engine` + `@idfkit/engine-assets` | 0.5.0 (2026-10-16) / 26.2.0 (2026-10-15) | Loader MIT; assets "SEE LICENSE IN LICENSE-EnergyPlus.txt" [code/repo] | EnergyPlus compiled to WASM; browser Web Worker or Node `worker_threads` | IDF and EPW strings | Not measured; I did not execute it | The only browser-runnable EnergyPlus found. Third-party, first published 2026-08-12, about 50–60 MB of assets [code/repo] |
| LBNL EnergyPlus-MCP | repo updated 2026-10-14 | LBNL BSD-style ("Other") [code/repo] | MCP server in Docker; 35 tools; EnergyPlus 26.1 pinned by default | Existing IDF | — | Needs Docker [code/repo] |

**Measurement notes [measured].**
- The DOE small office run used `ASHRAE901_OfficeSmall_STD2019_Denver.idf` with SF TMY3 weather. It came out at 286.6 MJ/m², which is 25.2 kBtu/ft². It was sized on Denver design days and logged 125,301 warnings, so treat it as a timing test, not an SF estimate.
- The footprint model (parcel 3582030: a 1901 single-family house, 2 stories, `hgt_median_m` 11.94) gave 191 m² conditioned against the Assessor's 1,904 ft² (177 m²).
- Its result was 411 MJ/m² (36.2 kBtu/ft²): 75.3 GJ heating and 3.1 GJ cooling. That is an **ideal-loads thermal load with no internal gains, no infiltration and geomeppy default constructions**. It is not fuel use. Its closeness to the ResStock median is a coincidence.
- No open alternative runs a real whole-building annual simulation in the browser besides the WASM build above. A 2024 Unmet Hours thread on compiling EnergyPlus to WASM had no answer [official docs: forum].

## 2. Data

| Source | ID / file | License | Size / records | How to get it |
|---|---|---|---|---|
| SF weather, TMY3 (SFO, WMO 724940) | `WeatherData/USA_CA_San.Francisco.Intl.AP.724940_TMY3.epw` inside the EnergyPlus release | Bundled with EnergyPlus; TMY3 is NREL/NSRDB-derived, probably public domain [inference] | 8,760 h; ASHRAE climate 3C, Köppen Csb; HDD18 ≈ 1,556, CDD18 22 (weather file) [measured] | Already on disk once EnergyPlus is installed |
| SF weather, TMYx | `USA_CA_San.Francisco.Intl.AP.724940_TMYx.2011-2025.zip`, plus `San.Francisco-Presidio.994016` and `Treasure.Island.724943` | **Unclear**: no license on the site; footer says "Copyright © 2014-2026 Climate.OneBuilding. All Rights Reserved" [official docs] | About 385 kB zip [measured] | climate.onebuilding.org, `.../CA_California/` |
| ResStock 2025 R1 (AMY2018) | `metadata_and_annual_results/by_state/full/csv/state=CA/CA_upgrade0.csv.gz` | CC BY 4.0 (OEDI) [dataset page] | 87.8 MB gz, 771 columns; 1,587 SF samples (`in.county = G0600750`) whose weights sum to 402,945 dwellings, against 423,007 Land Use units [measured] | Public S3 `oedi-data-lake/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/`. The county-level `full` CSV for SF returned 404 [measured] |
| ComStock 2025 R3 (AMY2018) | `.../by_state_and_county/basic/csv/state=CA/county=G0600750/CA_G0600750_upgrade0_basic.csv.gz` | CC BY 4.0 [dataset page] | 4.4 MB gz, 195 columns, 18,622 rows whose weights sum to 11,676 [measured] | Same bucket. Rows carry two county columns (`in.as_simulated_nhgis_county_gisjoin`, `in.nhgis_county_gisjoin`) [measured]. Fractional weights probably mean samples apportioned across counties [inference] |
| SF Existing Buildings Energy Performance Ordinance | `4ua7-5sfx` (benchmark reports), `vgqy-2ca4` (2,488 buildings), `96ck-qcfe` (combined) | PDDL 1.0 [dataset page] | 30,483 rows, 2011–2025; 2024 has 2,476 rows, 1,864 with `site_eui` [measured] | SODA. `benchmark_year` is **text**, so quote it: `$where=benchmark_year='2024'`. Covers non-residential ≥10,000 ft² and residential ≥50,000 ft² [dataset page] |
| DOE prototype models | PNNL, 90.1-2022: 16 building types × 19 climate locations [official docs] | US government work [inference] | — | energycodes.gov; I did not verify a download. EnergyPlus `ExampleFiles` already includes `ASHRAE901_OfficeSmall_STD2019_Denver.idf` and `RefBldg*New2004_Chicago.idf` [measured] |
| California Title 24 / CBECC | CBECC 2025.2.0.1 approved; 2025.3.0 is a release candidate (CEC meeting 2026-09-09) | CEC calls it "public domain" software, per a search summary; page not opened | — | bees.noresco.com. A compliance tool with a GUI, not a one-day path. SF is in CEC climate zone 3 [inference] |
| ENERGY STAR Portfolio Manager | Web services API (v27.0 live 2026-08-30, per a search summary) | EPA API terms of use | — | TEST environment first, then a LIVE access request [official docs]. It is the source of the EBO numbers; we only need it to submit data |

**EBO details [measured].**
- `parcel_number` looks like `0235/009`. `'SF' + parcel_number.replace('/', '')` matches footprint `mblr` for 2,217 of 2,476 rows in 2024.
- The misses are suffixed lots (`0857/002-A`, `8705/006A`) and condo lots (`8711/501`).
- Fields include `site_eui`, `source_eui`, `weather_normalized_site_eui`, `energy_star_score`, `electricity_use_grid_purchase`, `natural_gas_use`, `district_steam_use`, `total_ghg_emissions`, `floor_area`, `year_built` and `property_type`.
- The portal does not state the units of `site_eui`. Its values (e.g. 10.7 and 30.2) fit Portfolio Manager's kBtu/ft² [inference].

**Median site EUI in kBtu/ft² (ResStock and ComStock converted from kWh/ft² × 3.412) [measured].**

| Source, segment | n | Median EUI |
|---|---|---|
| EBO 2024 mean: Commercial / Mixed Residential / Multifamily | 1,272 / 417 / 153 | 49.6 / 37.6 / 36.8 |
| ComStock SF: SmallOffice / MediumOffice / LargeOffice | 4,082 / 2,195 / 1,238 | 44.3 / 45.0 / 55.5 |
| ComStock SF: RetailStripmall / LargeHotel / Warehouse / FullServiceRestaurant | 4,248 / 1,381 / 1,547 / 1,073 | 77.7 / 58.6 / 8.7 / 507.4 |
| ResStock SF: MF 5+ / MF 2–4 / SF attached / SF detached | 740 / 346 / 183 / 315 | 28.7 / 31.8 / 31.3 / 39.6 |
| ResStock SF detached by vintage: <1940 / 1940s / 1950s / 1960s | 174 / 42 / 40 / 22 | 40.8 / 46.5 / 38.0 / 32.5 |

The EBO office-heavy commercial mean (49.6) sits inside the ComStock office range (44–56), a useful sanity check for a checker agent [inference]. Post-1980 vintage cells have fewer than 15 samples, so pool them.

## 3. Cheap in-browser proxies

| Proxy | Tool / license | What it gives | Distance from a real simulation |
|---|---|---|---|
| Sun position and shadows | `suncalc` 2.1.1 (2026-10-05), BSD-2-Clause, ESM with bundled types [code/repo]. A three.js `DirectionalLight` uses its azimuth and altitude | Shadow animation, hours of direct sun per facade or roof, a solar-access heatmap | Geometrically exact for direct sun. No diffuse or reflected light and no fog (SF's main daylight factor), so it does not measure daylight [inference] |
| Window-to-wall ratio by orientation | Plain code on the footprint edges | Facade glazing summary; input to everything else | Descriptive only; it is a simulation input, not an output |
| Degree-day estimate | HDD18 ≈ 1,556 and CDD18 22 from the EPW [measured] | Heating ≈ UA × HDD × 24 h. Shows that SF is heating-dominated with almost no cooling | Ignores solar and internal gains, which matter a lot in SF's mild climate. Expect ±50% or worse [inference] |
| ResStock/ComStock lookup by type and vintage | §2 tables, CC BY 4.0 | Typical EUI and end-use split for "buildings like this one" | A stock median, not this building. Good for "typical vs this one" framing |
| EBO actuals | `4ua7-5sfx`, PDDL | Measured EUI and ENERGY STAR score for about 1.8k large buildings | Real data, but only large buildings, and it covers no small houses |

## 4. Geometry pipeline

**Minimum inputs for a useful model [inference].**
- A closed footprint ring in local metres, with collinear points under about 0.3 m dropped.
- Height and stories. Cap floor-to-floor at about 3–4 m: `hgt_median_m` 11.94 over 2 stories gave 6 m per floor in my test, because the LiDAR height includes the roof.
- One zone per floor (core/perimeter split is optional).
- Window area per orientation, or a single WWR.
- Constructions by vintage (e.g. uninsulated pre-1940 wood frame vs Title 24 era).
- Use type, which sets schedules and internal loads (ComStock type or DOE prototype).
- An infiltration rate and an HVAC choice; ideal loads is fine for a demo.
- Weather: SF EPW.

**What we need from the sibling docs.** From `floorplan-2d-to-3d.md`: rooms or zones as closed polygons with floor heights, plus openings tagged by wall orientation, width and height. From `floorplan-datasets-formats.md`: whether those come as gbXML or HPXML. HPXML only needs areas and orientations per facade, not 3D geometry.

**Pipelines.**
- **geomeppy (fastest; measured).** `IDF.add_block(name, coords, height, num_stories)`, then `intersect_match()`, `set_default_constructions()`, `set_wwr(0.2)`. Then add `HVACTemplate:Zone:IdealLoadsAirSystem` per zone and run with `energyplus -x` (ExpandObjects). Script to working run: about 30 min [measured]. Pitfalls [measured]:
  - `Minimal.idf` already contains `Output:Table:SummaryReports`, so a second copy is fatal.
  - Non-convex SF footprints raise 177 `CHKBKS` severe errors under the default `FullInteriorAndExterior`. Set `Building.Solar_Distribution = FullExterior`. One non-convex-shading severe remains, and the run completes.
- **honeybee (Ladybug).** `Room.from_polyface3d`/`from_footprint`-style builders, apertures by ratio, then OpenStudio. Richer (comfort maps, Radiance daylight) but AGPL-3.0 and more install [code/repo][inference].
- **URBANopt.** Takes footprints straight from GeoJSON with `building_type`, `floor_area` and `number_of_stories`, which is the shape of our SF layer. It needs Ruby, OpenStudio and its own project scaffold, so plan on half a day [inference].
- **Floorspace.js to OpenStudio.** A 2D floorplan drawing widget. Last release v0.8.0 (2018-06-27); `floorspace.nrel.gov` did not respond today; a dev build is on `natlabrockies.github.io/floorspace.js` [code/repo][measured]. Not a one-day path.
- **OpenStudio-HPXML.** v1.12.0 (2026-05-14), BSD-style, for residential [code/repo]. Fits houses where we know areas, stories and vintage but have no interior geometry [inference].

## 5. LLMs and simulation

- **EPlus-LLM.** Jiang, Ma, Zhang and Chen, *Applied Energy* 367 (2024) 123431 [peer-reviewed]. Fine-tuned `flan-t5-large`; natural language to IDF, then run through the EnergyPlus API. Authors report 100% accuracy on four prompt types and >95% effort reduction, measured on their own bounded prompt set [peer-reviewed].
  - A review says it struggles with complex geometry, multi-zone models and schedules [peer-reviewed].
  - The weights on Hugging Face are **CC-BY-NC-4.0** [code/repo].
  - A follow-up on prompt engineering: *Energy* 316 (2025) 134548 [peer-reviewed, per model card].
- **Agentic build-and-debug workflow.** Zhang, Ford, Chen and Chen, *Energy and Buildings* 327 (2025) 115116 [peer-reviewed]. Four planning agents turn a description into an error-free EnergyPlus model of NREL's iUnit. The abstract claims gains over naive prompting and manual modeling but gives no numbers.
- **"Advancing BEM with LLMs".** arXiv 2402.09579, *Energy and Buildings* 114788: case studies of LLMs across modeling tasks [peer-reviewed; not read in full].
- **EnergyPlus-MCP.** Li, Xu and Hong (LBNL), *SoftwareX*, Dec 2025, doi 10.1016/j.softx.2025.102367 [peer-reviewed]. 35 tools for loading, editing, validating and running IDFs. Repo `LBNL-ETA/EnergyPlus-MCP` (121 stars) [code/repo]. Community alternative: `idfkit/idfkit-mcp` (MIT, 37 tools) [code/repo].
- **What this means for us [inference].** None of these used our Crusoe open models, and the reported successes are self-reported on narrow benchmarks. The safe pattern is:
  - The LLM maps messy inputs (use code, vintage, user goals) to a validated parameter JSON.
  - Code builds the IDF.
  - EnergyPlus `eplusout.err` severe and fatal lines go back to the LLM as tool results so it can adjust parameters.
  - Free-form IDF authoring by an LLM is the speculative part.

## 6. Recommended one-day path

1. **Pick.** The user picks a building (SF layer or address). The server fetches the footprint (`ynuv-fyni`), the Assessor record (stories, `year_property_built`, `use_code`) and the EBO record if one exists.
2. **Parameters (LLM).** A fast model maps `use_code` and vintage to `{type, wwr, constructions, infiltration, setpoints, floors}` in strict JSON. Validate the ranges in code.
3. **Build (code).** geomeppy builds the multi-zone IDF from the footprint: 0.6 s, plus about 1 s of Python startup [measured].
4. **Run (code).** EnergyPlus on the server, 1.5–7 s for small buildings [measured]; one run per core in parallel.
5. **Fallback.** If the build or run fails twice, or the building is large or mixed-use, answer from the ResStock/ComStock median for its type and vintage, labelled as a lookup.
6. **Check (code plus LLM).** Compare EUI with the EBO actual or the stock median. Flag deviations over 2×. Parse warnings and severe errors.
7. **Show.** EUI in kBtu/ft², monthly heating/cooling bars (from `eplusmtr.csv`), the comparison to EBO or stock, and a sun/shadow view.

**Compute and latency.** Everything except the LLM calls runs on the SvelteKit Node host: a laptop during the demo, or any small Linux VM (EnergyPlus ships x86_64 and arm64 Linux builds) [code/repo]. Expect about 5–15 s per building end to end, dominated by LLM latency, and about 3–8 s for a re-run after a parameter edit [inference from measured parts].

## Fit with our stack

- **Backend now exists** (SvelteKit 3, adapter-node, SQLite/Drizzle).
  - Add a server-only module under `src/lib/server/sim/` that writes the IDF to a temp dir and runs `child_process.spawn('energyplus', ['-x', '-r', '-w', epw, '-d', out, idf])`.
  - Parse `eplustbl.csv`/`eplusmtr.csv` and delete the temp dir.
  - Add the binary path to `src/env.ts`. The 212 MB install lives on the host, not in the repo.
  - For geomeppy, call a small Python script through a pinned venv. To avoid Python, emit a simple IDF from TypeScript templates or with `@idfkit/core` (MIT) [inference].
- **Workbench artifacts.**
  - Lineage: building form → parameters form → IDF (markdown or code artifact) → results (markdown plus HTML chart).
  - Each results version records `duration` (seconds) and roughly zero model cost for the simulation step.
  - A WWR edit marks results stale, and `estimateRedo` will show seconds and cents, so the agent should just re-run instead of asking [inference].
- **Agent tool.** Add `run_energy_sim` to `tools.ts`. Append it at the end, because tool schema order is part of the cached prefix.
- **Sun/shadow.** three.js was removed. Either re-add `three` plus `suncalc` in a client-only Svelte component (dynamic `import()`, no SSR), or render it as an HTML artifact that loads three from a CDN inside the `sandbox="allow-scripts"` iframe.
- **WASM EnergyPlus in that iframe is doubtful [inference].** Without same-origin there is no cross-origin isolation, so no `SharedArrayBuffer`. The README says mid-run cancel needs it; whether a plain run works without it is unverified. The relevant entry for us is `@idfkit/engine/node` on the server, and the native binary is simpler and measured.
- **SF buildings layer.** Join EBO on `mblr` (89.5%) and add EUI as a colour mode next to units and year built [measured][inference].

## Fit with the hackathon

| Step | Who | Model / tool |
|---|---|---|
| Plan: "estimate energy and retrofit options for 123 Main St" → steps | Planner LLM | `openai/gpt-oss-120b` (most reliable tool calling, per the project skill) |
| Map use code and vintage → parameters; propose 5–10 retrofit variants (WWR, insulation, heat pump) | Sub-agents, parallel | `deepseek-ai/Deepseek-V4-Flash` or `nvidia/nemotron-3.5-lightning-30b-a3b`; spread across models for the 30-RPM-per-model limit |
| Build IDF, run EnergyPlus, parse outputs | Plain code tool | geomeppy plus EnergyPlus (no tokens) |
| Validate: sanity-check EUI against EBO or stock, read `eplusout.err`, retry with adjusted parameters | Checker: code rules first, LLM to explain or adjust | Fast model |
| Summarize trade-offs, cost per variant | LLM | Planner |

- **Realistic in one day.** Single-building geomeppy model, ideal loads, 5–10 variants, EBO and stock comparison, monthly chart, sun view.
- **Not realistic.** Radiance annual daylight, real HVAC systems, citywide runs. A citywide run is about 150k buildings × 2–7 s ≈ 4–12 CPU-days, before a single model failure [inference].
- **"Walk away" story.** The agent recovers from sim failures by itself (error file → parameter fix → re-run → stock fallback), and every run is a versioned artifact with duration and lineage.

## Open questions

- What are the units of `site_eui` in `4ua7-5sfx`? I assumed kBtu/ft²; the portal column description does not say.
- What do ComStock 2025 R3's fractional weights mean (18,622 rows summing to 11,676) for SF county? Read `README.pdf`.
- How much do SFO and Presidio weather differ? SFO is in San Mateo County. The Presidio TMYx licensing is unclear.
- Do `@idfkit/engine` runtime, memory and reliability hold up? Not executed here.
- Do the CBECC license wording and the DOE prototype download links hold up? Neither page was opened directly.
- What mapping from Assessor `use_code` to ComStock building type should we use? About 12k `COMM*` parcels, and mixed-use is common.
- What are default constructions by SF vintage? Pull them from ResStock `in.insulation_*` and window columns rather than guessing.

## Sources

- EnergyPlus releases and license: https://github.com/NatLabRockies/EnergyPlus/releases/tag/v26.2.0 ; https://github.com/NatLabRockies/EnergyPlus/blob/develop/LICENSE.txt
- OpenStudio: https://github.com/NatLabRockies/OpenStudio/releases/tag/v3.11.0 ; PyPI https://pypi.org/project/openstudio/
- Ladybug Tools: https://github.com/ladybug-tools/ladybug ; https://github.com/ladybug-tools/honeybee-energy ; https://github.com/ladybug-tools/honeybee-radiance ; https://www.ladybug.tools/
- Radiance: https://github.com/LBNL-ETA/Radiance (License.txt on `master`) ; https://www.radiance-online.org
- eppy https://github.com/santoshphilip/eppy ; geomeppy https://github.com/jamiebull1/geomeppy
- URBANopt CLI: https://github.com/urbanopt/urbanopt-cli ; Floorspace.js: https://github.com/NatLabRockies/floorspace.js ; OpenStudio-HPXML: https://github.com/NatLabRockies/OpenStudio-HPXML
- CityBES: https://citybes.lbl.gov/ ; https://buildings.lbl.gov/urban-science/tools
- pythermalcomfort: https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort ; CBE tool https://comfort.cbe.berkeley.edu/ ; https://github.com/CenterForTheBuiltEnvironment/comfort_tool
- BuildingsBench: https://github.com/NatLabRockies/BuildingsBench ; https://arxiv.org/abs/2307.00142 ; https://www.nlr.gov/computational-science/buildings-bench
- idfkit: https://www.npmjs.com/package/@idfkit/engine ; https://www.npmjs.com/package/@idfkit/engine-assets ; https://github.com/idfkit/idfkit-js ; https://github.com/idfkit/idfkit-mcp
- EnergyPlus WASM forum thread: https://unmethours.com/question/99813/energyplus-in-webassembly
- Weather: https://climate.onebuilding.org/ ; https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/USA_United_States_of_America/CA_California/
- ResStock/ComStock: https://data.openei.org/submissions/4520 ; https://oedi-data-lake.s3.amazonaws.com/?list-type=2&prefix=nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/ ; https://github.com/NatLabRockies/resstock ; https://github.com/NatLabRockies/ComStock
- SF EBO: https://data.sf.gov/d/4ua7-5sfx ; https://data.sf.gov/d/vgqy-2ca4 ; https://data.sf.gov/d/96ck-qcfe ; https://catalog.data.gov/dataset/existing-buildings-energy-performance-ordinance-report
- DOE prototypes: https://www.energycodes.gov/prototype-building-models ; CBECC: https://www.energy.ca.gov/programs-and-topics/programs/building-energy-efficiency-standards/2025-energy-code-compliance-software ; https://bees.noresco.com/software2025.html
- ENERGY STAR PM web services: https://portfoliomanager.energystar.gov/webservices/ ; terms https://portfoliomanager.energystar.gov/pdf/reference/Web%20Services%20API%20Terms%20of%20Use.pdf
- suncalc: https://github.com/mourner/suncalc
- EPlus-LLM: https://ideas.repec.org/a/eee/appene/v367y2024ics0306261924008146.html ; https://huggingface.co/EPlus-LLM/EPlus-LLMv1 ; agentic workflow: https://researchdiscovery.drexel.edu/esploro/outputs/journalArticle/Automatic-building-energy-model-development-and/991022197310804721 ; https://arxiv.org/abs/2402.09579 ; LLM HVAC review https://arxiv.org/pdf/2609.05314
- EnergyPlus-MCP: https://bies.lbl.gov/publications/energyplus-mcp-model-context ; https://github.com/LBNL-ETA/EnergyPlus-MCP
- NREL rename: https://www.energy.gov/eere/articles/energy-department-renames-nrel-national-lab-rockies
