// Path-traced "photo mode" (prototype). Builds the same scene as the blueprint viewer (full-height
// walls, textured floors, CC0 furniture models) and renders it with three-gpu-pathtracer's
// WebGLPathTracer on a classic WebGLRenderer, separate from the WebGPU viewer. While the camera moves
// the tracer shows a raster frame; once it stops, samples accumulate and the image converges.
// Browser-only: load it with a dynamic import from onMount.
import {
	ACESFilmicToneMapping,
	Box3,
	BoxGeometry,
	DirectionalLight,
	EquirectangularReflectionMapping,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	Scene,
	TextureLoader,
	Vector3,
	WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import type { Plan } from '../types.ts';
import { centroid } from '../validate.ts';
import { buildPlan, disposeBuild, type BuildResult, type FloorMaps } from './build.ts';
import { loadFurniture } from './furniture.ts';

export type PhotoCamera = 'orbit' | 'interior';

export interface PhotoStatus {
	phase: 'building' | 'refining' | 'done';
	samples: number;
	target: number;
}

export interface PhotoMode {
	setCamera(cam: PhotoCamera): void;
	setFullRes(on: boolean): void;
	dispose(): void;
}

/** Samples after which the image counts as converged and tracing pauses. */
const TARGET_SAMPLES = 400;
const DEFAULT_PIXEL_RATIO_CAP = 1.5;
const EYE_HEIGHT = 1.6;
/** Sun direction (towards the sun): high south-southwest, as in lighting.ts. */
const SUN_DIR = new Vector3(-0.26, 0.79, 0.56).normalize();

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

/** An eye-level pose inside the living room (or the largest room), looking across it. */
export function interiorPose(plan: Plan): { position: Vector3; target: Vector3 } {
	const story = plan.stories[0];
	const room =
		story.rooms.find((r) => r.type === 'living') ??
		[...story.rooms].sort((a, b) => b.polygon.length - a.polygon.length)[0];
	const [cx, cy] = centroid(room.polygon);
	// Back the camera towards the room's farthest corner and look past the centre.
	let far = room.polygon[0];
	for (const p of room.polygon)
		if (Math.hypot(p[0] - cx, p[1] - cy) > Math.hypot(far[0] - cx, far[1] - cy)) far = p;
	const dx = far[0] - cx;
	const dy = far[1] - cy;
	const y = story.elevation + EYE_HEIGHT;
	return {
		position: new Vector3(cx + dx * 0.75, y, -(cy + dy * 0.75)),
		target: new Vector3(cx - dx * 0.6, story.elevation + 1.2, -(cy - dy * 0.6))
	};
}

export async function mountPhoto(
	host: HTMLElement,
	plan: Plan,
	opts: { camera: PhotoCamera; fullRes?: boolean; onstatus: (s: PhotoStatus) => void }
): Promise<PhotoMode> {
	const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1;
	renderer.domElement.dataset.testid = 'plans-photo-canvas';
	renderer.domElement.style.display = 'block';
	host.appendChild(renderer.domElement);
	let fullRes = Boolean(opts.fullRes);
	const applyPixelRatio = () =>
		renderer.setPixelRatio(
			fullRes ? devicePixelRatio : Math.min(devicePixelRatio, DEFAULT_PIXEL_RATIO_CAP)
		);
	applyPixelRatio();

	const scene = new Scene();
	// The tracer needs an equirect environment (PMREM targets can't be sampled); a soft sky gradient.
	const sky = new GradientEquirectTexture(256);
	sky.topColor.set('#9cc4ff');
	sky.bottomColor.set('#f2eee6');
	sky.exponent = 0.6;
	sky.mapping = EquirectangularReflectionMapping;
	sky.update();
	scene.background = sky;
	scene.environment = sky;
	scene.environmentIntensity = 1;

	const sun = new DirectionalLight('#fff1dd', 3);
	scene.add(sun, sun.target);

	const camera = new PerspectiveCamera(50, 1, 0.05, 200);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = false;

	opts.onstatus({ phase: 'building', samples: 0, target: TARGET_SAMPLES });
	const floorMaps = await loadFloorMaps().catch(() => undefined);
	const build: BuildResult = buildPlan(plan, Infinity, floorMaps);
	// Glass is a 35%-opaque stand-in that would block most daylight in the tracer; leave the hole open.
	build.group.getObjectByName('glass')?.removeFromParent();
	scene.add(build.group);
	const story = plan.stories[0];
	const furn = await loadFurniture(story.furniture, {
		rooms: story.rooms,
		elevation: story.elevation
	}).catch((err) => {
		console.warn('photo: furniture models failed, keeping boxes', err);
		return null;
	});
	const fallbackMaterial = new MeshStandardMaterial({ color: '#b0a99f', roughness: 0.7 });
	const fallbackBoxes: Mesh[] = [];
	if (furn) {
		scene.add(furn.group);
		// Models replace the merged boxes; types without a model get a plain box each.
		build.group.getObjectByName('furniture')?.removeFromParent();
		const missing = new Set(furn.missing);
		for (const f of story.furniture) {
			if (!missing.has(f.type)) continue;
			const m = new Mesh(new BoxGeometry(f.w, f.h, f.d), fallbackMaterial);
			m.position.set(f.x, story.elevation + f.h / 2, -f.y);
			m.rotation.y = (f.rot * Math.PI) / 180;
			fallbackBoxes.push(m);
			scene.add(m);
		}
	}

	const box = new Box3().setFromObject(build.group);
	const center = box.getCenter(new Vector3());
	const size = box.getSize(new Vector3());
	const span = Math.max(size.x, size.z);
	sun.position
		.copy(SUN_DIR)
		.multiplyScalar(span * 2)
		.add(center);
	sun.target.position.copy(center);

	// A ceiling for interior shots, so daylight comes in through the windows rather than from above.
	const ceilingMaterial = new MeshStandardMaterial({ color: '#f7f6f3', roughness: 0.9 });
	const ceiling = new Mesh(new BoxGeometry(size.x + 0.4, 0.1, size.z + 0.4), ceilingMaterial);
	ceiling.position.set(center.x, story.elevation + story.height + 0.05, center.z);
	// Ground outside the unit so sunlight bounces back up through the windows.
	const groundMaterial = new MeshStandardMaterial({ color: '#b9b3a8', roughness: 1 });
	const ground = new Mesh(new BoxGeometry(span * 6, 0.1, span * 6), groundMaterial);
	ground.position.set(center.x, story.elevation - 0.06, center.z);
	scene.add(ground);

	const pathTracer = new WebGLPathTracer(renderer);
	pathTracer.multipleImportanceSampling = true; // directional lights need MIS
	pathTracer.bounces = 6;
	pathTracer.minSamples = 3;
	pathTracer.renderDelay = 150;
	pathTracer.fadeDuration = 300;
	pathTracer.tiles.set(2, 2);

	let cam: PhotoCamera = opts.camera;
	let lastReported = -1;
	let lastPhase: PhotoStatus['phase'] = 'building';

	function applyCamera() {
		if (cam === 'interior') {
			const pose = interiorPose(plan);
			camera.fov = 65;
			// The tracer's output skips tone mapping, so interiors get stronger light, not exposure.
			scene.environmentIntensity = 1.8;
			sun.intensity = 5;
			camera.position.copy(pose.position);
			controls.target.copy(pose.target);
			controls.minDistance = 0.1;
			controls.maxDistance = 30;
			controls.maxPolarAngle = Math.PI;
			if (!ceiling.parent) scene.add(ceiling);
		} else {
			camera.fov = 45;
			scene.environmentIntensity = 1;
			sun.intensity = 3;
			camera.position.set(center.x + span * 0.7, span * 1.1, center.z + span * 1.1);
			controls.target.copy(center).setY(0);
			controls.minDistance = 2;
			controls.maxDistance = 40;
			controls.maxPolarAngle = Math.PI / 2 - 0.05;
			ceiling.removeFromParent();
		}
		camera.updateProjectionMatrix();
		controls.update();
		pathTracer.setScene(scene, camera);
		pathTracer.pausePathTracing = false;
	}

	function resize() {
		const { clientWidth: w, clientHeight: h } = host;
		if (!w || !h) return;
		renderer.setSize(w, h, false);
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		pathTracer.updateCamera();
		pathTracer.pausePathTracing = false;
	}

	const onChange = () => {
		pathTracer.updateCamera();
		pathTracer.pausePathTracing = false;
	};
	controls.addEventListener('change', onChange);

	applyCamera();
	const observer = new ResizeObserver(resize);
	observer.observe(host);
	resize();

	renderer.setAnimationLoop(() => {
		pathTracer.renderSample();
		const samples = Math.floor(pathTracer.samples);
		const done = samples >= TARGET_SAMPLES;
		if (done) pathTracer.pausePathTracing = true;
		const phase = done ? 'done' : 'refining';
		if (samples !== lastReported || phase !== lastPhase) {
			lastReported = samples;
			lastPhase = phase;
			opts.onstatus({ phase, samples, target: TARGET_SAMPLES });
		}
	});

	return {
		setCamera(next) {
			if (next === cam) return;
			cam = next;
			applyCamera();
		},
		setFullRes(on) {
			fullRes = on;
			applyPixelRatio();
			resize();
		},
		dispose() {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			controls.removeEventListener('change', onChange);
			controls.dispose();
			pathTracer.dispose();
			furn?.dispose();
			for (const m of fallbackBoxes) m.geometry.dispose();
			fallbackMaterial.dispose();
			disposeBuild(build);
			if (floorMaps)
				for (const set of [floorMaps.wood, floorMaps.tile])
					for (const t of Object.values(set)) t.dispose();
			ceiling.geometry.dispose();
			ceilingMaterial.dispose();
			ground.geometry.dispose();
			groundMaterial.dispose();
			sky.dispose();
			sun.dispose();
			renderer.domElement.remove();
			renderer.dispose();
		}
	};
}
