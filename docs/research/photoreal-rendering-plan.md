# Photorealistic /plans viewer: feasibility and post-hackathon roadmap

Decided 2026-10-17. Scope: making the `/plans` apartment viewer look like professional residential architectural photography, live in the browser on a MacBook Pro M3 Max (30/40-core GPU, 3456x2234 display [official docs]).
Labels: [official docs] [code/repo] [forum] [measured] [inference]. Sources were not re-fetched for this plan: claims about library behavior come from the repo and forum pages listed below and should be re-checked before building.

## 1. Goal and bar

James (frontend) wants ArchViz-grade realism, interactive, in the browser. Three reference images (not committed) set the bar; they are not layouts to copy:
- **(a) A real SF listing photo.** Bright corner living room, floor-to-ceiling black-framed windows with a city view, walnut floor, cognac leather sectional, Eames-style lounge chair, knit pouf, grid rug, fiddle-leaf fig, abstract art.
- **(b) and (c) Warm Japandi CGI renders** (Blender/Unreal quality). Live-edge walnut dining table with a glass pitcher and oranges, spindle-back wood chairs, paper floor lamp, TV console, glass coffee table, chevron rug, plants, aquarium, soft warm lighting.

## 2. Current state (2026-10-17)

- `/plans` renders blueprints (4 bundled, plus any formloop listing via `?listing=<id>`) with three.js 0.186 `WebGPURenderer` [code/repo].
- Low and High presets are auto-detected. High adds PBR wood and tile floors, white walls with dark caps, daylight with soft PCF shadows, `RoomEnvironment`, neutral tone mapping, GTAO, SSR and TRAA. SSGI is built but off because it looks hazy [code/repo].
- Furniture is CC0: Poly Haven sofa, tables and wardrobe, Kenney low-poly bed, kitchen and bath.
- Verdict: a good 3D floor plan, not photography. The gap is lighting model and assets, not post effects.

## 3. Feasibility and approaches

Photo-level realism in a browser is feasible, but not at 60 fps with raster tricks alone.

| Approach | Realism | Cost and snags | Works on any generated layout? |
|---|---|---|---|
| Real-time only (today) | Game-engine look; no true indirect light or soft area shadows | Free; 60 fps | Yes |
| Path-traced photo mode, `three-gpu-pathtracer` | Photo-level: global illumination, soft shadows, glass, window light | Converges over seconds once the camera stops, then refines; runs the GPU hot [forum][code/repo]. The library targets `WebGLRenderer`, while we use `WebGPURenderer`, so photo mode likely needs a second renderer or canvas sharing the same scene [inference] | Yes, no baking: it traces the live three.js scene |
| Baked lighting, headless Blender Cycles lightmaps | Near-photo at 60 fps for static geometry | A bake of minutes per layout; needs a second UV channel (`uv1`) and glTF export of lightmaps has snags [forum][official docs]. Furniture moves break the bake | Only after a per-layout bake step |

**Recommendation.** Real-time while the camera moves, path-traced photo mode when it stops. Add baking later, only for hero units where a minutes-long bake is acceptable [inference]. A threepipe plugin wraps the path tracer if we want a packaged integration [code/repo].

## 4. What decides realism: assets and materials

Renderer upgrades will not close the gap in the images; assets will [inference].
- **Production furniture.** Real fabric weave, wood grain, leather and metal PBR sets (base color, normal, roughness, metalness), with bevelled edges. Low-poly Kenney models cap realism.
- **Plants and decor.** Fiddle-leaf fig, pouf, art, glass pitcher, fruit. Foliage needs alpha-tested or translucent leaf materials.
- **HDR sky through windows.** Floor-to-ceiling glass makes the view and the daylight a major part of the look. Use an HDRI for light and a city backdrop outside.
- **Architectural detail missing today.** Baseboards, window frames and mullions, ceiling lights, doors with frames and casings, crown or reveal details.
- **Real-world scale.** Metres throughout; furniture dimensions match real products.
- **Licensing and provenance.**
  - Poly Haven: CC0, no attribution needed.
  - Sketchfab: many models are CC-BY, so attribution is required; check each model's license.
  - Paid stores: read the license for web redistribution.
  - Record every asset (source URL, author, license) in the `CREDITS` files next to the assets [code/repo].

## 5. Phases

1. **Phase 1, photo-mode prototype on one unit.** One polished living room in the Japandi style of refs (b) and (c): production assets, window HDRI, architectural trim, path-traced photo mode. Decide the renderer question (second `WebGLRenderer` vs port) here.
2. **Phase 2, cameras.** Orbit with zoom and pan, plus first-person WASD walkthrough with collision against blueprint walls and smooth transitions between modes. Both views use the same scene.
3. **Phase 3, scene editing.** Select, move and rotate furniture; persist the scene. Align with the scene contract in `docs/cozy-implementation-plan.md`: canonical validated JSON in `artifact_versions.content`, bottom-centre furniture pivots, yaw in radians, scene data independent of GPU objects [code/repo].
4. **Phase 4, agent integration.** Agents propose layout operations through the typed scene-mutation API (add, move, rotate, remove, lock, lighting). They never drive the renderer directly.

Acceptance criteria from the brief:
1. A realistic furnished 3D apartment, not a static background image.
2. Convincing material detail, indirect illumination and soft shadows.
3. We can rotate the camera and walk through the apartment.
4. Furniture stays correctly positioned and proportioned.
5. The demo stays responsive during interaction.
6. The scene integrates with the existing app.

Priority order: visual fidelity, then camera functionality, then editable geometry, then agent automation. Deliver one polished room before the whole apartment. Note the brief says SvelteKit; the `/plans` viewer is already in the SvelteKit frontend.

## Sources

- three-gpu-pathtracer: https://github.com/gkjohnson/three-gpu-pathtracer
- Announcement thread: https://discourse.threejs.org/t/three-gpu-pathtracer-a-modular-shader-based-path-tracing-extension-for-three-js/36903
- threepipe path-tracing plugin: https://threepipe.org/package/plugin-path-tracing.html
- Realistic ambience in architectural scenes: https://discourse.threejs.org/t/achieving-realistic-ambience-in-architectural-three-js-scenes/89753
- Lightmaps baked elsewhere into three.js: https://discourse.threejs.org/t/how-can-lightmaps-baked-in-unity-be-used-in-three-js-is-there-currently-a-workflow-for-exporting-lightmaps-from-unity-for-use-in-three-js/92706
- Blender lightmap and AO baking: https://www.educative.io/courses/learn-threejs-for-computer-graphics/blender-to-bake-lightmaps-and-ambient-occlusion
- Poly Haven: https://polyhaven.com
- MacBook Pro specs: https://support.apple.com/en-us/117737
- Scene contract: `docs/cozy-implementation-plan.md`

## Appendix: Original brief

The brief below is the user's prompt, verbatim, with headings demoted two levels.

### Build a Photorealistic Real-Time Apartment in Three.js

#### Objective

Build an interactive, photorealistic 3D apartment using **Three.js, TypeScript, and SvelteKit**, integrated into the existing project.

The target is **high-end architectural visualization (ArchViz)** comparable to realistic interior renders created in Blender Cycles or Unreal Engine, but optimized for real-time rendering in a desktop web browser.

**Important:** This is not a request to generate a static image, a 2D illustration, or an isometric cartoon. Build a real, navigable 3D environment with realistic geometry, materials, and lighting.

Use the attached apartment image as our primary visual reference.

#### 1. Art Direction

**Style:** Photorealistic Modern Japandi / Scandinavian Apartment

Create a warm, comfortable, lived-in residential environment with:

- Natural medium-tone oak wood flooring with realistic grain.
- Warm ivory walls with subtle surface roughness.
- A cream-colored fabric sofa with a natural wooden frame.
- A low-profile wooden television console and realistic flat-screen television.
- A glass coffee table with plausible reflections.
- A soft patterned area rug.
- Indoor plants with varied leaf shapes, materials, and translucency.
- A compact dining area with wooden chairs.
- A small open kitchen toward the rear of the apartment.
- Contemporary ceiling lights and subtle recessed lighting.
- Wall-mounted artwork and small decorative objects.

Avoid exaggerated proportions, cartoon styling, obvious primitive geometry, saturated artificial colors, and excessively glossy surfaces.

Furniture must look like believable manufactured products, not placeholder boxes.

**Visual goal:** At a glance, a screenshot should resemble professional residential architectural photography.

#### 2. Photorealistic Rendering

Use physically based rendering throughout the scene.

##### Materials

- MeshStandardMaterial and MeshPhysicalMaterial where appropriate.
- High-quality textures for base color, normal, roughness, and metalness.
- Realistic glass, fabric, wood, metal, and painted surfaces.
- Correct texture color spaces and physically plausible material properties.
- Real-world material scale and consistent units.

##### Lighting

Implement a convincing indoor lighting system using:

- HDR environment illumination and image-based reflections.
- Soft natural daylight entering through windows.
- Warm artificial ceiling lights.
- Soft contact shadows underneath furniture.
- Ambient occlusion for realistic depth.
- Baked indirect illumination or lightmaps for static room geometry when appropriate.
- Dynamic shadows for movable furniture.

Use subtle tone mapping and color grading.

Avoid excessive bloom, extreme saturation, unnaturally dark corners, and sharp artificial shadows.

Prioritize natural light distribution over flashy visual effects.

#### 3. Interactive 3D Experience

Support two camera modes:

**Mode A: First-Person Interior Walkthrough**

- Eye-level perspective camera.
- Natural field of view.
- Smooth WASD movement.
- Mouse-controlled camera orientation.
- Basic wall and furniture collision handling.

**Mode B: Rotatable Apartment Overview**

- Orbit camera around the apartment.
- Zoom and pan.
- Optional roof hiding and cutaway walls.
- Smooth transitions between camera modes.

The same 3D environment should support both views.

#### 4. Dynamic Scene Architecture

Prepare the application for future recursive-agent interaction.

Represent the apartment as structured scene data, separating:

- Room dimensions and wall geometry.
- Doors and windows.
- Furniture instances and transformations.
- Materials and lighting configuration.
- Camera state.

Allow furniture to be selected, moved, and rotated.

Changes should update the rendered scene without requiring a full page reload.

Respect existing scene schemas and integration contracts documented in the repository rather than inventing incompatible replacements.

#### 5. Performance

Target smooth rendering on modern desktop browsers.

- Aim for 60 FPS on capable hardware, with graceful degradation.
- Load furniture and environmental assets asynchronously.
- Use optimized GLB/glTF models.
- Compress textures and geometry where beneficial.
- Reuse materials, textures, and cached assets.
- Avoid unnecessarily expensive real-time ray tracing.
- Provide adjustable rendering quality.
- Properly dispose of GPU resources when components unmount.

Photorealism is the priority, but the experience must remain interactive.

#### 6. Integration Requirements

Inspect the current repository before modifying files.

- Retain SvelteKit and TypeScript.
- Use Three.js as the rendering engine.
- Use GLTFLoader for external models.
- Integrate the renderer into the existing frontend.
- Avoid unrelated architecture changes.
- Follow existing project instructions, dependency conventions, and tests.
- Use appropriately licensed assets and record their provenance.

Do not substitute low-quality procedural furniture for production-quality assets without clearly identifying the temporary placeholders.

#### 7. Implementation Sequence

Implement incrementally:

**Phase 1: Visual prototype**

Build one complete, attractive living room using realistic assets, lighting, and materials. Prioritize resemblance to the reference image.

**Phase 2: Camera interaction**

Add orbit controls and first-person navigation.

**Phase 3: Scene editing**

Support furniture selection, movement, rotation, and scene persistence.

**Phase 4: Agent integration**

Prepare APIs and scene operations so specialized agents can propose room-layout modifications without directly controlling or rewriting the renderer.

#### Acceptance Criteria

The implementation is successful when:

1. The browser displays a realistic, furnished 3D apartment rather than a static background image.
2. The scene features convincing material detail, indirect illumination, and soft shadows.
3. We can rotate the camera and walk through the apartment.
4. Furniture remains correctly positioned and realistically proportioned.
5. The demo remains responsive during interaction.
6. The scene integrates with the existing SvelteKit application.

**Final priority:** Visual fidelity first, then camera functionality, then editable geometry, then agent automation.

Deliver one polished, runnable room before expanding to the entire apartment or adding complex agent behavior.
