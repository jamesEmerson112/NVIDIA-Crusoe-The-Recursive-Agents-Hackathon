// Browser-only blueprint viewer. Renders on the viewer's own GPU with three's WebGPURenderer,
// which falls back to WebGL2 when WebGPU is unavailable. Load it with a dynamic import from onMount.
import {
	AxesHelper,
	Box3,
	Box3Helper,
	Color,
	DirectionalLight,
	GridHelper,
	Group,
	HemisphereLight,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGPURenderer
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import GUI from 'lil-gui';
import Stats from 'stats-gl';
import type { Plan } from '../types.ts';
import { area, centroid } from '../validate.ts';
import { buildPlan, disposeBuild, type BuildResult } from './build.ts';

export type View = 'dollhouse' | 'top' | 'full';

/** Timings measured outside the viewer (fetch, validation) that the debug panel should show. */
export interface ExternalTimings {
	fetchMs?: number;
	validateMs?: number;
}

export interface Viewer {
	setPlan(plan: Plan, timings?: ExternalTimings): void;
	setView(view: View): void;
	setDebug(on: boolean): void;
	dispose(): void;
}

const DOLLHOUSE_CUT = 1.2;

export async function mount(host: HTMLElement, opts: { debug: boolean }): Promise<Viewer> {
	const renderer = new WebGPURenderer({ antialias: true });
	await renderer.init();
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.domElement.dataset.testid = 'plan-viewer-canvas';
	renderer.domElement.style.display = 'block';
	host.appendChild(renderer.domElement);
	const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
		? 'WebGPU'
		: 'WebGL2';

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
	scene.add(new HemisphereLight('#ffffff', '#b9b2a6', 1.6));
	const sun = new DirectionalLight('#ffffff', 1.8);
	sun.position.set(6, 12, 4);
	scene.add(sun);

	const camera = new PerspectiveCamera(45, 1, 0.1, 200);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.maxPolarAngle = Math.PI / 2 - 0.05;
	controls.minDistance = 2;
	controls.maxDistance = 40;

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
		cutHeight: DOLLHOUSE_CUT
	};
	const stats = {
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
		wallPieces: 0
	};

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
		if (build) {
			build.group.removeFromParent();
			disposeBuild(build);
		}
		clearOverlays();
		const cut = view === 'full' ? Infinity : settings.cutHeight;
		build = buildPlan(plan, cut);
		scene.add(build.group);
		for (const m of build.materials) m.wireframe = settings.wireframe;
		const story = plan.stories[0];
		for (const r of story.rooms) {
			const [cx, cy] = centroid(r.polygon);
			const o = label(
				`<strong>${r.name}</strong><br>${area(r.polygon).toFixed(1)} m²`,
				'plan-label',
				'plan-viewer-room-label'
			);
			o.position.set(cx, 0.3, -cy);
			o.visible = settings.labels;
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
		controls.target.copy(center).setY(0);
		if (!fit) return;
		if (view === 'top') camera.position.set(center.x, span * 1.6, center.z + 0.01);
		else camera.position.set(center.x + span * 0.7, span * 1.1, center.z + span * 1.1);
		controls.update();
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
	renderer.setAnimationLoop((time) => {
		controls.update();
		renderer.render(scene, camera);
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
			for (const key of ['fetchMs', 'validateMs', 'buildMs', 'firstFrameMs', 'wallPieces'] as const)
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
		setPlan(next, timings = {}) {
			plan = next;
			external = timings;
			stats.fetchMs = external.fetchMs ?? 0;
			stats.validateMs = external.validateMs ?? 0;
			pendingFirstFrame = performance.now();
			rebuild();
			frame(true);
		},
		setView(next) {
			view = next;
			if (next === 'full') settings.cutHeight = 2.7;
			else if (settings.cutHeight >= 2.7) settings.cutHeight = DOLLHOUSE_CUT;
			gui?.controllersRecursive().forEach((c) => c.updateDisplay());
			rebuild();
			frame(true);
		},
		setDebug,
		dispose() {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			setDebug(false);
			clearOverlays();
			if (build) disposeBuild(build);
			grid.dispose();
			axes.dispose();
			controls.dispose();
			labelRenderer.domElement.remove();
			renderer.domElement.remove();
			renderer.dispose();
		}
	};
}
