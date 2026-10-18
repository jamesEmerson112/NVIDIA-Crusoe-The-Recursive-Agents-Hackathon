/**
 * Photoreal showcase living room (Phase 1 of docs/research/photoreal-rendering-plan.md).
 * Hand-built shell (walls, window wall, trim, rug, TV, lamp) plus CC0 Poly Haven furniture from
 * /room/models. Lit by a Poly Haven HDRI (environment + window backdrop), a sun through the
 * window with soft shadows, and warm lamps. Imported dynamically from the page's onMount.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { CAMERA_PRESETS, ROOM, presetById, type CameraPreset } from './presets.ts';

const BASE = '/room';
const W = ROOM.width / 2; // half width (x)
const D = ROOM.depth / 2; // half depth (z)
const H = ROOM.height;
const T = 0.15; // wall thickness
const WIN = { x0: -2.1, x1: 2.1, sill: 0.3, head: 2.45 };

/**
 * The same room shell staged as different apartments, so walkthroughs of different places don't
 * look identical. 'airy' is the original daylight Japandi room; 'warm' mirrors the layout and
 * changes floor, walls, textiles, several furniture pieces and the light (golden hour).
 */
export type RoomStyle = 'airy' | 'warm';
export const ROOM_STYLES: { id: RoomStyle; label: string }[] = [
	{ id: 'airy', label: 'Airy daylight' },
	{ id: 'warm', label: 'Warm evening' }
];

export interface RoomHandle {
	setPreset(id: string): void;
	dispose(): void;
}

export interface RoomOptions {
	onProgress?(loaded: number, total: number): void;
	onReady?(): void;
	onError?(message: string): void;
	/** Which apartment look to stage. Default 'airy'. */
	style?: RoomStyle;
	/** Ambient occlusion (soft contact shadows in corners and under furniture). Default true. */
	ambientOcclusion?: boolean;
}

interface Place {
	at: [number, number];
	rot?: number;
	/** Scale so the larger horizontal extent equals this many metres. */
	fit?: number;
	/** Snap an edge of the rotated bounding box to a coordinate (e.g. against a wall). */
	maxX?: number;
	minX?: number;
	minZ?: number;
	maxZ?: number;
	/** Floor height for the object's bottom (default 0), or top height for hanging objects. */
	y?: number;
	maxY?: number;
}

export async function createRoom(
	container: HTMLElement,
	opts: RoomOptions = {}
): Promise<RoomHandle> {
	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		powerPreference: 'high-performance'
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.AgXToneMapping;
	const warm = opts.style === 'warm';
	renderer.toneMappingExposure = warm ? 1.05 : 1.15;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.VSMShadowMap;
	container.appendChild(renderer.domElement);
	renderer.domElement.style.display = 'block';
	renderer.domElement.style.width = '100%';
	renderer.domElement.style.height = '100%';

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 200);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.maxDistance = 6;
	controls.minDistance = 0.4;
	controls.maxPolarAngle = Math.PI * 0.62;

	const disposables: { dispose(): void }[] = [];
	const track = <T extends { dispose(): void }>(d: T): T => {
		disposables.push(d);
		return d;
	};

	// The warm style mirrors the room in x, so mirror the camera presets with it.
	const mx = warm ? -1 : 1;
	function applyPreset(p: CameraPreset) {
		camera.position.set(p.position[0] * mx, p.position[1], p.position[2]);
		camera.fov = p.fov;
		camera.updateProjectionMatrix();
		controls.target.set(p.target[0] * mx, p.target[1], p.target[2]);
		controls.update();
	}
	applyPreset(CAMERA_PRESETS[0]);

	const resize = () => {
		const w = Math.max(1, container.clientWidth);
		const h = Math.max(1, container.clientHeight);
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};
	// Ambient occlusion: GTAO darkens creases, corners and the floor under furniture, which the
	// shadow-mapped sun and hemisphere fill alone leave flat. OutputPass then applies the
	// renderer's tone mapping and colour space, so the look matches the direct render.
	const composer = opts.ambientOcclusion === false ? null : new EffectComposer(renderer);
	let gtao: GTAOPass | null = null;
	if (composer) {
		composer.addPass(new RenderPass(scene, camera));
		gtao = new GTAOPass(scene, camera, 1, 1);
		gtao.output = GTAOPass.OUTPUT.Default;
		gtao.blendIntensity = 1;
		gtao.updateGtaoMaterial({
			radius: 0.5,
			distanceExponent: 1.5,
			thickness: 1.2,
			scale: 1,
			samples: 16
		});
		gtao.updatePdMaterial({
			lumaPhi: 10,
			depthPhi: 2,
			normalPhi: 3,
			radius: 6,
			rings: 2,
			samples: 16
		});
		composer.addPass(gtao);
		composer.addPass(new OutputPass());
	}

	const ro = new ResizeObserver(() => {
		resize();
		composer?.setPixelRatio(renderer.getPixelRatio());
		composer?.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
	});
	ro.observe(container);
	resize();
	composer?.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));

	// ---------- textures & materials ----------
	const texLoader = new THREE.TextureLoader();
	const total = 13;
	let loaded = 0;
	const tick = () => opts.onProgress?.(++loaded, total);
	const maxAniso = renderer.capabilities.getMaxAnisotropy();
	function tex(name: string, repeat: [number, number], srgb: boolean) {
		const t = track(texLoader.load(name.startsWith('/') ? name : `${BASE}/textures/${name}`));
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set(...repeat);
		t.anisotropy = maxAniso;
		if (srgb) t.colorSpace = THREE.SRGBColorSpace;
		return t;
	}

	// Warm: darker walnut-toned laminate from the shared floor-plan textures.
	const floorRepeat: [number, number] = warm ? [2.8, 3.2] : [2.2, 2.6];
	const floorMat = track(
		new THREE.MeshStandardMaterial({
			map: tex(
				warm ? '/textures/laminate_floor_02_diff.jpg' : 'wood_floor_diff_1k.jpg',
				floorRepeat,
				true
			),
			normalMap: tex(
				warm ? '/textures/laminate_floor_02_nor.jpg' : 'wood_floor_nor_gl_1k.jpg',
				floorRepeat,
				false
			),
			roughnessMap: tex(
				warm ? '/textures/laminate_floor_02_rough.jpg' : 'wood_floor_rough_1k.jpg',
				floorRepeat,
				false
			),
			color: warm ? new THREE.Color(0.78, 0.6, 0.45) : new THREE.Color(1.0, 0.9, 0.78),
			roughness: 0.85,
			envMapIntensity: 0.9
		})
	);
	floorMat.normalScale.set(0.6, 0.6);
	const wallRepeat: [number, number] = [2, 1.2];
	const wallMat = track(
		new THREE.MeshStandardMaterial({
			normalMap: tex('white_plaster_02_nor_gl_1k.jpg', wallRepeat, false),
			roughnessMap: tex('white_plaster_02_rough_1k.jpg', wallRepeat, false),
			color: new THREE.Color(warm ? '#e0d2bb' : '#f7efe2'),
			roughness: 0.92
		})
	);
	wallMat.normalScale.set(0.18, 0.18);
	const ceilingMat = track(
		new THREE.MeshStandardMaterial({
			color: warm ? '#f1e9db' : '#f7f2ea',
			roughness: 0.95,
			emissive: warm ? '#f1e9db' : '#f7f2ea',
			emissiveIntensity: 0.12
		})
	);
	const trimMat = track(new THREE.MeshStandardMaterial({ color: '#f3eee6', roughness: 0.55 }));
	const frameMat = track(
		new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.45, metalness: 0.4 })
	);
	const glassMat = track(
		new THREE.MeshPhysicalMaterial({
			color: '#ffffff',
			roughness: 0.03,
			metalness: 0,
			transparent: true,
			opacity: 0.06,
			envMapIntensity: 1.2,
			depthWrite: false
		})
	);

	// ---------- shell ----------
	function box(
		w: number,
		h: number,
		d: number,
		mat: THREE.Material,
		x: number,
		y: number,
		z: number,
		shadow = true
	) {
		const geo = track(new THREE.BoxGeometry(w, h, d));
		const m = new THREE.Mesh(geo, mat);
		m.position.set(x, y, z);
		m.castShadow = shadow;
		m.receiveShadow = true;
		scene.add(m);
		return m;
	}

	const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM.width, ROOM.depth)), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.receiveShadow = true;
	scene.add(floor);
	box(ROOM.width + 2 * T, T, ROOM.depth + 2 * T, ceilingMat, 0, H + T / 2, 0);

	// Left (TV) wall, right (sofa) wall, front wall.
	box(T, H, ROOM.depth + 2 * T, wallMat, -W - T / 2, H / 2, 0);
	box(T, H, ROOM.depth + 2 * T, wallMat, W + T / 2, H / 2, 0);
	box(ROOM.width, H, T, wallMat, 0, H / 2, D + T / 2);
	// Window wall (z = -D) built around a large opening.
	box(ROOM.width, WIN.sill, T, wallMat, 0, WIN.sill / 2, -D - T / 2);
	box(ROOM.width, H - WIN.head, T, wallMat, 0, (H + WIN.head) / 2, -D - T / 2);
	box(
		WIN.x0 + W,
		WIN.head - WIN.sill,
		T,
		wallMat,
		(-W + WIN.x0) / 2,
		(WIN.sill + WIN.head) / 2,
		-D - T / 2
	);
	box(
		W - WIN.x1,
		WIN.head - WIN.sill,
		T,
		wallMat,
		(W + WIN.x1) / 2,
		(WIN.sill + WIN.head) / 2,
		-D - T / 2
	);

	// Window frames, mullions, glass and interior sill.
	const winW = WIN.x1 - WIN.x0;
	const winH = WIN.head - WIN.sill;
	const winY = (WIN.sill + WIN.head) / 2;
	const fz = -D - 0.06;
	const fw = 0.05;
	box(winW, fw, 0.07, frameMat, 0, WIN.sill + fw / 2, fz);
	box(winW, fw, 0.07, frameMat, 0, WIN.head - fw / 2, fz);
	for (let i = 0; i <= 4; i++) {
		const x = WIN.x0 + (winW * i) / 4;
		box(i === 0 || i === 4 ? fw : 0.035, winH, 0.07, frameMat, x, winY, fz);
	}
	box(winW, 0.03, 0.05, frameMat, 0, 2.05, fz);
	box(winW + 0.1, 0.03, 0.2, trimMat, 0, WIN.sill - 0.015, -D + 0.02);
	const glass = new THREE.Mesh(track(new THREE.PlaneGeometry(winW, winH)), glassMat);
	glass.position.set(0, winY, fz - 0.01);
	scene.add(glass);

	// Baseboards.
	const bb = 0.09;
	box(ROOM.width, bb, 0.015, trimMat, 0, bb / 2, D - 0.0075, false);
	box(0.015, bb, ROOM.depth, trimMat, -W + 0.0075, bb / 2, 0, false);
	box(0.015, bb, ROOM.depth, trimMat, W - 0.0075, bb / 2, 0, false);
	box(WIN.x0 + W, bb, 0.015, trimMat, (-W + WIN.x0) / 2, bb / 2, -D + 0.0075, false);
	box(W - WIN.x1, bb, 0.015, trimMat, (W + WIN.x1) / 2, bb / 2, -D + 0.0075, false);

	// Sheer linen curtains gathered at both sides of the window.
	const curtainMat = track(
		new THREE.MeshStandardMaterial({
			color: warm ? '#c9ad86' : '#f1ebe1',
			roughness: 1,
			transparent: true,
			opacity: warm ? 0.92 : 0.82,
			side: THREE.DoubleSide
		})
	);
	for (const x of [WIN.x0 + 0.18, WIN.x1 - 0.18]) {
		const geo = track(new THREE.PlaneGeometry(0.42, H - 0.08, 24, 1));
		const pos = geo.attributes.position;
		for (let i = 0; i < pos.count; i++) {
			pos.setZ(i, Math.sin(pos.getX(i) * 38) * 0.035);
		}
		geo.computeVertexNormals();
		const c = new THREE.Mesh(geo, curtainMat);
		c.position.set(x, (H - 0.08) / 2, -D + 0.12);
		c.castShadow = true;
		scene.add(c);
	}
	box(winW + 0.5, 0.02, 0.02, frameMat, 0, H - 0.06, -D + 0.12, false);

	// Recessed downlights (visual only).
	const downMat = track(
		new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffe9c8', emissiveIntensity: 2 })
	);
	const discGeo = track(new THREE.CircleGeometry(0.045, 24));
	for (const [x, z] of [
		[-1.2, -1.6],
		[1.2, -1.6],
		[-1.2, 0.6],
		[1.2, 0.6]
	]) {
		const d = new THREE.Mesh(discGeo, downMat);
		d.rotation.x = Math.PI / 2;
		d.position.set(x, H - 0.001, z);
		scene.add(d);
	}

	// ---------- rug (procedural Japandi lattice) ----------
	const rugTex = track(new THREE.CanvasTexture(makeRugCanvas(warm)));
	rugTex.colorSpace = THREE.SRGBColorSpace;
	rugTex.anisotropy = maxAniso;
	const rugMat = track(new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
	const rug = box(1.9, 0.012, 2.7, rugMat, 0.15, 0.006, -0.55, false);
	rug.material = rugMat;

	// ---------- TV on the left wall ----------
	const tv = new THREE.Group();
	const tvBody = track(
		new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4, metalness: 0.5 })
	);
	const tvScreen = track(
		new THREE.MeshPhysicalMaterial({
			color: '#050608',
			roughness: 0.12,
			metalness: 0,
			clearcoat: 1,
			clearcoatRoughness: 0.05
		})
	);
	const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.84, 1.46)), tvBody);
	const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(1.44, 0.82)), tvScreen);
	screen.rotation.y = Math.PI / 2;
	screen.position.x = 0.0151;
	tv.add(body, screen);
	tv.position.set(-W + 0.03, 1.38, -0.55);
	body.castShadow = true;
	scene.add(tv);

	// ---------- glass coffee table with oak frame ----------
	const oakMat = track(
		new THREE.MeshStandardMaterial({
			map: tex('wood_floor_diff_1k.jpg', [0.3, 0.3], true),
			color: '#e9cfa8',
			roughness: 0.6
		})
	);
	const tableGlass = track(
		new THREE.MeshPhysicalMaterial({
			color: '#eef5f2',
			roughness: 0.02,
			transparent: true,
			opacity: 0.28,
			specularIntensity: 1,
			envMapIntensity: 1.5
		})
	);
	{
		const cx = 0.2;
		const cz = -0.55;
		const L = 1.15;
		const Wd = 0.62;
		const h = 0.4;
		box(Wd, 0.012, L, tableGlass, cx, h, cz, false);
		box(Wd - 0.06, 0.012, L - 0.06, tableGlass, cx, 0.13, cz, false);
		for (const sx of [-1, 1])
			for (const sz of [-1, 1])
				box(
					0.035,
					h - 0.006,
					0.035,
					oakMat,
					cx + sx * (Wd / 2 - 0.03),
					(h - 0.006) / 2,
					cz + sz * (L / 2 - 0.03)
				);
		for (const sx of [-1, 1])
			box(0.03, 0.03, L - 0.06, oakMat, cx + sx * (Wd / 2 - 0.03), 0.115, cz);
		for (const sx of [-1, 1])
			box(0.03, 0.03, L - 0.06, oakMat, cx + sx * (Wd / 2 - 0.03), h - 0.03, cz);
	}

	// ---------- framed art (oak frames, abstract prints) ----------
	function art(seed: number, w: number, h: number, pos: [number, number, number], rotY: number) {
		const g = new THREE.Group();
		const t = track(new THREE.CanvasTexture(makeArtCanvas(seed)));
		t.colorSpace = THREE.SRGBColorSpace;
		const print = track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
		const f = 0.03;
		const parts: [number, number, number, number][] = [
			[w + 2 * f, f, 0, (h + f) / 2],
			[w + 2 * f, f, 0, -(h + f) / 2],
			[f, h, -(w + f) / 2, 0],
			[f, h, (w + f) / 2, 0]
		];
		for (const [pw, ph, px, py] of parts) {
			const m = new THREE.Mesh(track(new THREE.BoxGeometry(pw, ph, 0.03)), oakMat);
			m.position.set(px, py, 0.015);
			m.castShadow = true;
			g.add(m);
		}
		const canvas = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), print);
		canvas.position.z = 0.012;
		g.add(canvas);
		g.position.set(...pos);
		g.rotation.y = rotY;
		scene.add(g);
	}
	art(warm ? 5 : 1, 1.0, 0.7, [W - 0.005, 1.55, -0.55], -Math.PI / 2);
	art(warm ? 6 : 2, 0.6, 0.8, [-1.15, 1.5, D - 0.005], Math.PI);

	// ---------- table lamp (paper shade) ----------
	const shadeMat = track(
		new THREE.MeshStandardMaterial({
			color: '#f4e8d2',
			emissive: '#ffcf8f',
			emissiveIntensity: 1.6,
			roughness: 1,
			side: THREE.DoubleSide
		})
	);
	const baseMat = track(new THREE.MeshStandardMaterial({ color: '#c9b9a3', roughness: 0.6 }));

	// ---------- lights ----------
	// Warm: low golden-hour sun for long raking shadows, with the lamps doing more of the work.
	const sun = new THREE.DirectionalLight(warm ? '#ffc488' : '#fff3e2', warm ? 4.2 : 5.5);
	if (warm) sun.position.set(-6.5, 3.2, -9);
	else sun.position.set(-3.2, 6.5, -9);
	sun.target.position.set(0.4, 0, 0.2);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -5;
	sun.shadow.camera.right = 5;
	sun.shadow.camera.top = 5;
	sun.shadow.camera.bottom = -5;
	sun.shadow.camera.near = 1;
	sun.shadow.camera.far = 25;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.02;
	sun.shadow.radius = 6;
	sun.shadow.blurSamples = 16;
	scene.add(sun, sun.target);

	const bounce = warm
		? new THREE.HemisphereLight('#ffe6c7', '#a8876a', 0.8)
		: new THREE.HemisphereLight('#fffaf2', '#d9c3a5', 1.1);
	scene.add(bounce);

	const pendantLight = new THREE.PointLight('#ffc98a', warm ? 5 : 3.2, 6, 2);
	pendantLight.position.set(-1.15, 1.85, 1.9);
	scene.add(pendantLight);
	const lampLight = new THREE.PointLight('#ffbf7a', warm ? 4 : 2.4, 5, 2);
	scene.add(lampLight);

	// ---------- HDRI ----------
	const pmrem = new THREE.PMREMGenerator(renderer);
	const hdrPromise = new HDRLoader().loadAsync(`${BASE}/hdri/rooitou_park_2k.hdr`).then((hdr) => {
		hdr.mapping = THREE.EquirectangularReflectionMapping;
		track(hdr);
		const env = track(pmrem.fromEquirectangular(hdr).texture);
		scene.background = hdr;
		scene.backgroundIntensity = warm ? 0.6 : 0.85;
		scene.backgroundRotation.set(0, Math.PI * 0.35, 0);
		scene.environment = env;
		scene.environmentIntensity = warm ? 0.32 : 0.42;
		scene.environmentRotation.set(0, Math.PI * 0.35, 0);
		tick();
	});

	// ---------- furniture ----------
	const gltfLoader = new GLTFLoader();
	async function model(name: string, p: Place): Promise<THREE.Group> {
		const url = name.startsWith('/') ? name : `${BASE}/models/${name}.glb`;
		const gltf = await gltfLoader.loadAsync(url);
		const inner = gltf.scene;
		inner.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.isMesh) {
				m.castShadow = true;
				m.receiveShadow = true;
			}
		});
		const wrap = new THREE.Group();
		wrap.name = name;
		wrap.add(inner);
		let b = new THREE.Box3().setFromObject(inner);
		if (p.fit) {
			const s = b.getSize(new THREE.Vector3());
			inner.scale.multiplyScalar(p.fit / Math.max(s.x, s.z));
			b = new THREE.Box3().setFromObject(inner);
		}
		const c = b.getCenter(new THREE.Vector3());
		inner.position.set(-c.x, -b.min.y, -c.z);
		wrap.rotation.y = p.rot ?? 0;
		wrap.position.set(p.at[0], p.y ?? 0, p.at[1]);
		scene.add(wrap);
		wrap.updateMatrixWorld(true);
		const wb = new THREE.Box3().setFromObject(wrap);
		if (p.maxX !== undefined) wrap.position.x += p.maxX - wb.max.x;
		if (p.minX !== undefined) wrap.position.x += p.minX - wb.min.x;
		if (p.maxZ !== undefined) wrap.position.z += p.maxZ - wb.max.z;
		if (p.minZ !== undefined) wrap.position.z += p.minZ - wb.min.z;
		if (p.maxY !== undefined) wrap.position.y += p.maxY - wb.max.y;
		tick();
		return wrap;
	}

	const tableCenter: [number, number] = [-1.15, 1.9];
	const chairs = [0.35, Math.PI * 0.95, Math.PI * 1.55].map((phi) =>
		model('dining_chair_02', {
			at: [tableCenter[0] + Math.sin(phi) * 0.62, tableCenter[1] + Math.cos(phi) * 0.62],
			rot: phi + Math.PI
		}).then(warm ? keep : linenChair)
	);

	const jobs: Promise<unknown>[] = [
		hdrPromise,
		model('/models/sofa.glb', {
			at: [W - 0.5, -0.55],
			rot: -Math.PI / 2,
			fit: 2.25,
			maxX: W - 0.04
		}).then(warm ? oliveVelvet : creamUpholstery),
		warm
			? model('/models/armchair.glb', { at: [-1.25, -2.05], rot: 0.75, fit: 0.85 })
			: model('mid_century_lounge_chair', { at: [-1.25, -2.05], rot: 0.75 }),
		model(warm ? '/models/tv-console.glb' : 'modern_wooden_cabinet', {
			at: [-W + 0.3, -0.55],
			rot: Math.PI / 2,
			fit: 1.8,
			minX: -W + 0.02
		}),
		model('round_wooden_table_01', { at: tableCenter, fit: 1.05 }).then(warm ? keep : oakStain),
		...chairs,
		model('modern_ceiling_lamp_01', { at: tableCenter, maxY: H }),
		warm
			? model('/models/plant-large.glb', { at: [W - 0.45, -D + 0.45], fit: 0.6 })
			: model('pachira_aquatica_01', { at: [W - 0.45, -D + 0.45] }),
		model('potted_plant_02', { at: [-W + 0.35, 0.75] }),
		model('side_table_01', { at: [W - 0.3, -1.95] }).then(async (t) => {
			const top = new THREE.Box3().setFromObject(t).max.y;
			await model('ceramic_vase_01', { at: [W - 0.38, -2.02], y: top });
			buildLamp(W - 0.22, -1.86, top);
		})
	];

	function buildLamp(x: number, z: number, y: number) {
		const base = new THREE.Mesh(track(new THREE.SphereGeometry(0.08, 32, 16)), baseMat);
		base.position.set(x, y + 0.08, z);
		base.castShadow = true;
		const shade = new THREE.Mesh(
			track(new THREE.CylinderGeometry(0.12, 0.15, 0.22, 48, 1, true)),
			shadeMat
		);
		shade.position.set(x, y + 0.3, z);
		scene.add(base, shade);
		lampLight.position.set(x, y + 0.28, z);
	}

	// Warm mirrors the whole room (TV and sofa swap sides). three flips face winding for
	// negative-determinant transforms, so lighting and shadows stay correct.
	if (warm) scene.scale.x = -1;

	let disposed = false;
	Promise.all(jobs)
		.then(() => {
			if (!disposed) opts.onReady?.();
		})
		.catch((e: unknown) => opts.onError?.(e instanceof Error ? e.message : String(e)));

	renderer.setAnimationLoop(() => {
		controls.update();
		if (composer) composer.render();
		else renderer.render(scene, camera);
	});

	return {
		setPreset(id: string) {
			applyPreset(presetById(id));
		},
		dispose() {
			disposed = true;
			renderer.setAnimationLoop(null);
			ro.disconnect();
			controls.dispose();
			scene.traverse((o) => {
				const m = o as THREE.Mesh;
				if (m.isMesh) {
					m.geometry?.dispose();
					const mats = Array.isArray(m.material) ? m.material : [m.material];
					for (const mat of mats) {
						for (const v of Object.values(mat)) {
							if (v instanceof THREE.Texture) v.dispose();
						}
						mat.dispose();
					}
				}
			});
			for (const d of disposables) d.dispose();
			gtao?.dispose();
			composer?.dispose();
			pmrem.dispose();
			sun.shadow.map?.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		}
	};
}

/**
 * Re-dye single-material Poly Haven models in the shader. `glsl` reads `diffuseColor` (after the
 * base-colour map) and sets `dyeMask`, `dyeColor` and `dyeRough`; masked texels take the new
 * colour and roughness, the rest keep the original texture. `diffuseColor` is linear, so dark
 * sRGB leather is only a few hundredths of luminance.
 */
function dye(key: string, glsl: string) {
	return (root: THREE.Object3D) => {
		root.traverse((o) => {
			const m = o as THREE.Mesh;
			if (!m.isMesh) return;
			const mat = (m.material as THREE.MeshStandardMaterial).clone();
			mat.customProgramCacheKey = () => `room-dye-${key}`;
			mat.onBeforeCompile = (shader) => {
				shader.fragmentShader = shader.fragmentShader
					.replace(
						'#include <map_fragment>',
						`#include <map_fragment>
						float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
						float chroma = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) -
							min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
						float dyeMask = 0.0;
						vec3 dyeColor = diffuseColor.rgb;
						float dyeRough = 0.9;
						${glsl}
						diffuseColor.rgb = mix(diffuseColor.rgb, dyeColor, dyeMask);`
					)
					.replace(
						'#include <roughnessmap_fragment>',
						`#include <roughnessmap_fragment>
						roughnessFactor = mix(roughnessFactor, dyeRough, dyeMask);`
					);
			};
			m.material = mat;
		});
	};
}

/** Black leather sofa becomes cream boucle; the reddish wood frame (high chroma) is kept. */
const creamUpholstery = dye(
	'sofa',
	`dyeMask = 1.0 - smoothstep(0.035, 0.09, chroma);
	dyeColor = vec3(0.86, 0.80, 0.70) * (0.82 + 0.6 * lum);
	dyeRough = 0.95;`
);
/** Brown leather dining chairs become oatmeal linen; the black legs (darkest texels) stay. */
const linenChair = dye(
	'chair',
	`dyeMask = smoothstep(0.004, 0.012, lum);
	dyeColor = vec3(0.5, 0.43, 0.33) * (0.85 + 2.0 * lum);
	dyeRough = 0.95;`
);
/** Black leather sofa becomes olive velvet (warm style); the wood frame is kept. */
const oliveVelvet = dye(
	'sofa-olive',
	`dyeMask = 1.0 - smoothstep(0.035, 0.09, chroma);
	dyeColor = vec3(0.16, 0.19, 0.11) * (0.8 + 0.9 * lum);
	dyeRough = 0.78;`
);
/** Leave a model as authored (the warm style keeps brown leather chairs and the mahogany table). */
const keep = (root: THREE.Object3D) => root;
/** Mahogany table becomes light oak, keeping the grain from the luminance. */
const oakStain = dye(
	'oak',
	`dyeMask = 1.0;
	dyeColor = vec3(0.36, 0.23, 0.12) * (0.55 + 6.0 * lum);
	dyeRough = 0.55;`
);

/** Soft abstract print: warm paper, overlapping earth-tone arcs and a charcoal line. */
function makeArtCanvas(seed: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = 512;
	c.height = 512;
	const g = c.getContext('2d');
	if (!g) return c;
	g.fillStyle = '#efe7da';
	g.fillRect(0, 0, 512, 512);
	const palette = ['#c9a27e', '#8c6e54', '#d8c3a5', '#6f7a6a', '#b88a6a'];
	for (let i = 0; i < 4; i++) {
		g.fillStyle = palette[(i + seed) % palette.length];
		g.globalAlpha = 0.85;
		g.beginPath();
		const r = 90 + ((i * 37 + seed * 53) % 90);
		g.arc(
			120 + ((i * 131 + seed * 71) % 280),
			140 + ((i * 97 + seed * 29) % 260),
			r,
			0,
			Math.PI * (1 + (i % 2))
		);
		g.fill();
	}
	g.globalAlpha = 1;
	g.strokeStyle = '#2f2b27';
	g.lineWidth = 5;
	g.beginPath();
	g.moveTo(60, 420 - seed * 40);
	g.bezierCurveTo(180, 300, 320, 470, 460, 330 + seed * 20);
	g.stroke();
	return c;
}

/** Cream wool rug with a charcoal border and a soft diamond lattice, plus fibre noise. */
function makeRugCanvas(warm = false): HTMLCanvasElement {
	const w = 768;
	const h = 1088;
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const g = c.getContext('2d');
	if (!g) return c;
	// Warm: terracotta field with a dark brown border and cream lattice.
	g.fillStyle = warm ? '#a8684a' : '#e8dfcf';
	g.fillRect(0, 0, w, h);
	g.strokeStyle = warm ? '#3b2a21' : '#4f4943';
	g.lineWidth = 22;
	g.strokeRect(30, 30, w - 60, h - 60);
	g.lineWidth = 4;
	g.strokeRect(70, 70, w - 140, h - 140);
	g.save();
	g.beginPath();
	g.rect(80, 80, w - 160, h - 160);
	g.clip();
	g.strokeStyle = warm ? '#e3cfb2' : '#a99a85';
	g.lineWidth = 3;
	const s = 76;
	for (let k = -h; k < w + h; k += s) {
		g.beginPath();
		g.moveTo(k, 0);
		g.lineTo(k + h, h);
		g.stroke();
		g.beginPath();
		g.moveTo(k, h);
		g.lineTo(k + h, 0);
		g.stroke();
	}
	g.restore();
	const img = g.getImageData(0, 0, w, h);
	for (let i = 0; i < img.data.length; i += 4) {
		const n = (Math.random() - 0.5) * 18;
		img.data[i] += n;
		img.data[i + 1] += n;
		img.data[i + 2] += n;
	}
	g.putImageData(img, 0, 0);
	return c;
}
