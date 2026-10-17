// Browser-only blueprint viewer. Renders on the viewer's own GPU with three's WebGPURenderer,
// which falls back to WebGL2 when WebGPU is unavailable. Load it with a dynamic import from onMount.
import {
	AxesHelper,
	Box3,
	BoxGeometry,
	Box3Helper,
	Color,
	GridHelper,
	Group,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	Scene,
	TextureLoader,
	Vector3,
	WebGPURenderer
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import GUI from 'lil-gui';
import Stats from 'stats-gl';
import type { Plan } from '../types.ts';
import { area, centroid } from '../validate.ts';
import { buildPlan, disposeBuild, type BuildResult, type FloorMaps } from './build.ts';
import { loadFurniture } from './furniture.ts';
import { createLighting } from './lighting.ts';
import { createPost, type PostEffect } from './post.ts';
import { detectQuality, PRESETS, type Quality } from './quality.ts';
import { createWalk, EYE_HEIGHT, startPose, WALK_FOV, wallSegments } from './walk.ts';

export type View = 'dollhouse' | 'top' | 'full' | 'walk';

/** Timings measured outside the viewer (fetch, validation) that the debug panel should show. */
export interface ExternalTimings {
	fetchMs?: number;
	validateMs?: number;
}

export interface Viewer {
	/** The preset in use and why it was chosen (auto-detected or forced by `?quality=`). */
	readonly quality: { quality: Quality; reason: string };
	setPlan(plan: Plan, timings?: ExternalTimings): void;
	setView(view: View): void;
	setDebug(on: boolean): void;
	dispose(): void;
}

const DOLLHOUSE_CUT = 1.2;
const ORBIT_FOV = 45;
const TWEEN_MS = 600;

/** CC0 floor textures from Poly Haven, served from static/textures/ (High only). */
async function loadFloorMaps(): Promise<FloorMaps> {
	const loader = new TextureLoader();
	const set = async (name: string) => {
		const [map, normalMap, roughnessMap] = await Promise.all(
			['diff', 'nor', 'rough'].map((k) => loader.loadAsync(`/textures/${name}_${k}.jpg`))
		);
		return { map, normalMap, roughnessMap };
	};
	const [wood, tile] = await Promise.all([set('laminate_floor_02'), set('interior_tiles')]);
	return { wood, tile };
}

export async function mount(
	host: HTMLElement,
	opts: { debug: boolean; quality?: Quality | null }
): Promise<Viewer> {
	// Neither preset uses MSAA (High anti-aliases with TRAA), so the renderer can be created before
	// the preset is known; detection needs the backend that init() picks.
	const renderer = new WebGPURenderer({ antialias: false });
	await renderer.init();
	renderer.domElement.dataset.testid = 'plan-viewer-canvas';
	renderer.domElement.style.display = 'block';
	host.appendChild(renderer.domElement);
	const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
		? 'WebGPU'
		: 'WebGL2';
	const detected = detectQuality({
		hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
		webgpu: backend === 'WebGPU',
		urlOverride: opts.quality
	});
	const preset = PRESETS[detected.quality];
	renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatioCap));

	const labelRenderer = new CSS2DRenderer();
	Object.assign(labelRenderer.domElement.style, {
		position: 'absolute',
		inset: '0',
		pointerEvents: 'none'
	});
	labelRenderer.domElement.dataset.testid = 'plan-viewer-labels';
	host.appendChild(labelRenderer.domElement);

	const scene = new Scene();
	scene.background = new Color(
		matchMedia('(prefers-color-scheme: dark)').matches ? '#18181b' : '#f4f4f5'
	);
	const lighting = createLighting(scene, renderer, preset);
	// The photoreal look (textured floors, dark wall caps) belongs to High; a failed load falls back.
	const floorMaps: FloorMaps | undefined =
		detected.quality === 'high' ? await loadFloorMaps().catch(() => undefined) : undefined;

	const camera = new PerspectiveCamera(ORBIT_FOV, 1, 0.1, 200);
	// Null on Low, or if the effects can't be built on this backend; then we render directly.
	const post = createPost(renderer, scene, camera, preset);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.maxPolarAngle = Math.PI / 2 - 0.05;
	controls.minDistance = 2;
	controls.maxDistance = 40;
	const walk = createWalk(camera, renderer.domElement);
	/** Camera move between orbit and walk; the loop drives it and skips controls while it runs. */
	let tween: {
		t0: number;
		from: { pos: Vector3; target: Vector3; fov: number };
		to: { pos: Vector3; target: Vector3; fov: number };
		done: () => void;
	} | null = null;

	const helpers = new Group();
	const grid = new GridHelper(30, 30, '#a1a1aa', '#d4d4d8');
	const axes = new AxesHelper(1.5);
	helpers.add(grid, axes);
	scene.add(helpers);

	let plan: Plan | null = null;
	let build: BuildResult | null = null;
	let view: View = 'dollhouse';
	let labels: CSS2DObject[] = [];
	let wallLabels: CSS2DObject[] = [];
	let boxes: Box3Helper[] = [];
	let pendingFirstFrame = 0;
	let external: ExternalTimings = {};

	const settings = {
		wireframe: false,
		labels: true,
		wallIds: false,
		boundingBoxes: false,
		gridAxes: false,
		cutHeight: DOLLHOUSE_CUT,
		shadows: preset.shadows,
		...(post ? post.effects() : {})
	};
	const stats = {
		quality: detected.quality,
		reason: detected.reason,
		backend,
		drawCalls: 0,
		triangles: 0,
		geometries: 0,
		textures: 0,
		pixelRatio: renderer.getPixelRatio(),
		fetchMs: 0,
		validateMs: 0,
		buildMs: 0,
		firstFrameMs: 0,
		wallPieces: 0,
		furnitureMs: 0,
		missingModels: 0
	};

	// High swaps the merged box furniture for CC0 models (furniture.ts). Furniture does not depend
	// on the cut height or view, so one load is kept per plan; the token discards stale loads.
	let furnToken = 0;
	let furnPlan: Plan | null = null;
	let furn: Awaited<ReturnType<typeof loadFurniture>> | null = null;
	// Plain boxes for items whose type has no model (the merged box mesh is hidden as a whole).
	let fallbackBoxes: Mesh[] = [];
	const fallbackMaterial = new MeshStandardMaterial({ color: '#b0a99f', roughness: 0.7 });

	function clearFurniture() {
		furnToken++;
		furn?.dispose();
		furn = null;
		for (const m of fallbackBoxes) {
			m.removeFromParent();
			m.geometry.dispose();
		}
		fallbackBoxes = [];
		furnPlan = null;
		stats.furnitureMs = 0;
		stats.missingModels = 0;
	}

	function loadModels(p: Plan) {
		const token = ++furnToken;
		furnPlan = p;
		const story = p.stories[0];
		loadFurniture(story.furniture, { rooms: story.rooms, elevation: story.elevation }).then(
			(res) => {
				if (token !== furnToken) return res.dispose();
				furn = res;
				scene.add(res.group);
				// The boxes stand in while the models load; hide them once the models are in.
				const boxMesh = build?.group.getObjectByName('furniture');
				if (boxMesh) boxMesh.visible = false;
				const missing = new Set(res.missing);
				for (const f of story.furniture) {
					if (!missing.has(f.type)) continue;
					const geo = new BoxGeometry(f.w, f.h, f.d);
					const m = new Mesh(geo, fallbackMaterial);
					m.position.set(f.x, story.elevation + f.h / 2, -f.y);
					m.rotation.y = (f.rot * Math.PI) / 180;
					m.castShadow = m.receiveShadow = true;
					fallbackBoxes.push(m);
					scene.add(m);
				}
				stats.furnitureMs = res.ms;
				stats.missingModels = res.missing.length;
			},
			(err) => {
				if (token !== furnToken) return;
				console.warn('furniture: model load failed, keeping boxes', err);
			}
		);
	}

	let gui: GUI | null = null;
	let fps: Stats | null = null;

	function label(text: string, className: string, testid: string) {
		const el = document.createElement('div');
		el.className = className;
		el.dataset.testid = testid;
		el.innerHTML = text;
		return new CSS2DObject(el);
	}

	function clearOverlays() {
		for (const o of [...labels, ...wallLabels]) {
			o.element.remove();
			o.removeFromParent();
		}
		for (const b of boxes) {
			b.removeFromParent();
			b.dispose();
		}
		labels = [];
		wallLabels = [];
		boxes = [];
	}

	function rebuild() {
		if (!plan) return;
		if (furnPlan !== plan) clearFurniture();
		if (build) {
			build.group.removeFromParent();
			disposeBuild(build);
		}
		clearOverlays();
		const cut = view === 'full' || view === 'walk' ? Infinity : settings.cutHeight;
		build = buildPlan(plan, cut, floorMaps);
		scene.add(build.group);
		lighting.fitTo(new Box3().setFromObject(build.group));
		for (const m of build.materials) m.wireframe = settings.wireframe;
		const boxMesh = build.group.getObjectByName('furniture');
		if (floorMaps && boxMesh) {
			if (furnPlan !== plan) loadModels(plan);
			boxMesh.visible = !furn;
		}
		const story = plan.stories[0];
		for (const r of story.rooms) {
			const [cx, cy] = centroid(r.polygon);
			const o = label(
				`<strong>${r.name}</strong><br>${area(r.polygon).toFixed(1)} m²`,
				'plan-label',
				'plan-viewer-room-label'
			);
			o.position.set(cx, 0.3, -cy);
			o.visible = settings.labels && view !== 'walk';
			labels.push(o);
			scene.add(o);
		}
		for (const w of story.walls) {
			const o = label(w.id, 'plan-label plan-label-wall', 'plan-viewer-wall-label');
			o.position.set(
				(w.a[0] + w.b[0]) / 2,
				Math.min(cut, story.height) + 0.15,
				-(w.a[1] + w.b[1]) / 2
			);
			o.visible = settings.wallIds;
			wallLabels.push(o);
			scene.add(o);
		}
		build.group.traverse((o) => {
			if (o.name === 'furniture' || o.name === 'walls') {
				const b = new Box3Helper(
					new Box3().setFromObject(o),
					o.name === 'walls' ? '#ef4444' : '#3b82f6'
				);
				b.visible = settings.boundingBoxes;
				boxes.push(b);
				scene.add(b);
			}
		});
		stats.buildMs = build.buildMs;
		stats.wallPieces = build.counts.pieces;
	}

	function frame(fit = false) {
		if (!build) return;
		const box = new Box3().setFromObject(build.group);
		const center = box.getCenter(new Vector3());
		const size = box.getSize(new Vector3());
		const span = Math.max(size.x, size.z);
		const target = center.clone().setY(0);
		if (view === 'walk') return enterWalk();
		const wasWalking = !controls.enabled;
		walk.disable();
		if (!fit && !wasWalking) {
			controls.target.copy(target);
			return;
		}
		const pos =
			view === 'top'
				? new Vector3(center.x, span * 1.6, center.z + 0.01)
				: new Vector3(center.x + span * 0.7, span * 1.1, center.z + span * 1.1);
		const done = () => {
			controls.target.copy(target);
			controls.enabled = true;
			controls.update();
		};
		if (wasWalking) startTween({ pos, target, fov: ORBIT_FOV }, done);
		else {
			tween = null;
			camera.position.copy(pos);
			done();
		}
	}

	function currentPose() {
		const dir = camera.getWorldDirection(new Vector3());
		return {
			pos: camera.position.clone(),
			target: controls.enabled ? controls.target.clone() : camera.position.clone().add(dir),
			fov: camera.fov
		};
	}

	function startTween(to: { pos: Vector3; target: Vector3; fov: number }, done: () => void) {
		tween = { t0: performance.now(), from: currentPose(), to, done };
	}

	function enterWalk() {
		if (!plan) return;
		const story = plan.stories[0];
		walk.disable();
		walk.setStory(story);
		const { pos, dir } = startPose(story, wallSegments(story));
		const eye = new Vector3(pos[0], story.elevation + EYE_HEIGHT, -pos[1]);
		const target = eye.clone().add(new Vector3(dir[0], 0, -dir[1]));
		const wasOrbiting = controls.enabled || tween !== null;
		controls.enabled = false;
		const done = () => {
			camera.position.copy(eye);
			camera.lookAt(target);
			walk.enable();
		};
		if (wasOrbiting) startTween({ pos: eye, target, fov: WALK_FOV }, done);
		else {
			tween = null;
			camera.fov = WALK_FOV;
			camera.updateProjectionMatrix();
			done();
		}
	}

	function stepTween() {
		if (!tween) return;
		const k = Math.min(1, (performance.now() - tween.t0) / TWEEN_MS);
		const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
		const { from, to } = tween;
		camera.position.lerpVectors(from.pos, to.pos, e);
		camera.lookAt(new Vector3().lerpVectors(from.target, to.target, e));
		camera.fov = from.fov + (to.fov - from.fov) * e;
		camera.updateProjectionMatrix();
		if (k < 1) return;
		const done = tween.done;
		tween = null;
		done();
	}

	function resize() {
		const { clientWidth: w, clientHeight: h } = host;
		if (!w || !h) return;
		renderer.setSize(w, h, false);
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';
		labelRenderer.setSize(w, h);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}
	const observer = new ResizeObserver(resize);
	observer.observe(host);
	resize();

	let lastStats = 0;
	let lastTime = 0;
	renderer.setAnimationLoop((time) => {
		const dt = lastTime ? (time - lastTime) / 1000 : 0;
		lastTime = time;
		if (tween) stepTween();
		else if (controls.enabled) controls.update();
		else walk.update(dt);
		if (post) post.render();
		else renderer.render(scene, camera);
		labelRenderer.render(scene, camera);
		if (pendingFirstFrame) {
			stats.firstFrameMs = performance.now() - pendingFirstFrame;
			pendingFirstFrame = 0;
		}
		if (fps) fps.update();
		if (gui && time - lastStats > 250) {
			lastStats = time;
			stats.drawCalls = renderer.info.render.drawCalls;
			stats.triangles = renderer.info.render.triangles;
			stats.geometries = renderer.info.memory.geometries;
			stats.textures = renderer.info.memory.textures;
		}
	});

	function setDebug(on: boolean) {
		if (on && !gui) {
			fps = new Stats({ trackGPU: true, horizontal: false });
			fps.dom.dataset.testid = 'plan-viewer-fps';
			Object.assign(fps.dom.style, { position: 'absolute', top: '8px', left: '8px', zIndex: '10' });
			host.appendChild(fps.dom);
			fps.init(renderer);
			gui = new GUI({ container: host, title: 'Debug' });
			gui.domElement.dataset.testid = 'plan-viewer-debug';
			Object.assign(gui.domElement.style, {
				position: 'absolute',
				top: '8px',
				right: '8px',
				zIndex: '10'
			});
			const q = gui.addFolder('Quality');
			q.add(stats, 'quality').disable();
			q.add(stats, 'reason').disable();
			q.add(settings, 'shadows').onChange((v: boolean) => lighting.setShadows(v));
			if (post)
				for (const name of ['ao', 'ssgi', 'ssr', 'taa'] as PostEffect[])
					q.add(settings as Record<string, unknown>, name).onChange((v: boolean) =>
						post.setEffect(name, v)
					);
			const r = gui.addFolder('Renderer');
			for (const key of [
				'backend',
				'drawCalls',
				'triangles',
				'geometries',
				'textures',
				'pixelRatio'
			] as const)
				r.add(stats, key).listen().disable();
			const b = gui.addFolder('Build (ms)');
			for (const key of [
				'fetchMs',
				'validateMs',
				'buildMs',
				'firstFrameMs',
				'furnitureMs',
				'wallPieces',
				'missingModels'
			] as const)
				b.add(stats, key).listen().disable().decimals(2);
			const t = gui.addFolder('Toggles');
			t.add(settings, 'wireframe').onChange((v: boolean) =>
				build?.materials.forEach((m) => (m.wireframe = v))
			);
			t.add(settings, 'labels').onChange((v: boolean) => labels.forEach((o) => (o.visible = v)));
			t.add(settings, 'wallIds')
				.name('wall ids')
				.onChange((v: boolean) => wallLabels.forEach((o) => (o.visible = v)));
			t.add(settings, 'boundingBoxes')
				.name('bounding boxes')
				.onChange((v: boolean) => boxes.forEach((o) => (o.visible = v)));
			t.add(settings, 'gridAxes')
				.name('grid + axes')
				.onChange((v: boolean) => (helpers.visible = v));
			t.add(settings, 'cutHeight', 0.3, 2.7, 0.05)
				.name('cut height (m)')
				.onFinishChange(() => rebuild());
		} else if (!on && gui) {
			gui.destroy();
			fps?.dom.remove();
			gui = null;
			fps = null;
		}
	}

	helpers.visible = settings.gridAxes;
	setDebug(opts.debug);

	return {
		quality: detected,
		setPlan(next, timings = {}) {
			plan = next;
			external = timings;
			stats.fetchMs = external.fetchMs ?? 0;
			stats.validateMs = external.validateMs ?? 0;
			pendingFirstFrame = performance.now();
			rebuild();
			// A new plan in walk mode drops the camera straight in rather than flying from the old one.
			if (view === 'walk') controls.enabled = false;
			frame(true);
		},
		setView(next) {
			view = next;
			if (next === 'full' || next === 'walk') settings.cutHeight = 2.7;
			else if (settings.cutHeight >= 2.7) settings.cutHeight = DOLLHOUSE_CUT;
			gui?.controllersRecursive().forEach((c) => c.updateDisplay());
			rebuild();
			frame(true);
		},
		setDebug,
		dispose() {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			post?.dispose();
			lighting.dispose();
			if (floorMaps)
				for (const set of [floorMaps.wood, floorMaps.tile])
					for (const t of Object.values(set)) t.dispose();
			setDebug(false);
			clearOverlays();
			clearFurniture();
			fallbackMaterial.dispose();
			if (build) disposeBuild(build);
			grid.dispose();
			axes.dispose();
			controls.dispose();
			walk.dispose();
			labelRenderer.domElement.remove();
			renderer.domElement.remove();
			renderer.dispose();
		}
	};
}
