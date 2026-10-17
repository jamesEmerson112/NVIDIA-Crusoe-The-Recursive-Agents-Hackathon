// Ambient 3D San Francisco skyline for the start page.
// Ported from PulsePoint SF's SanFrancisco3D.js (MapTiler + deck.gl GeoJsonLayer). The original
// needed a MapTiler API key for its basemap; this port draws the same extruded GeoJSON buildings
// (same default view: downtown SF, 60° pitch, -30° bearing, same category colours) with plain
// three.js and no key. Low-rise blocks around the landmarks are procedural filler so the
// skyline reads as a city without a basemap. Load this module with a dynamic import from onMount.
import * as THREE from 'three';

type Ring = [number, number][];
interface BuildingFeature {
	properties: { name?: string; height?: number; category?: string };
	geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: string; coordinates: unknown };
}
interface BuildingCollection {
	features: BuildingFeature[];
}

export interface SfSceneOptions {
	dataUrl: string;
	reducedMotion: boolean;
}

export interface SfScene {
	dispose(): void;
	resize(width: number, height: number): void;
}

// Local tangent-plane projection around the Financial District, in metres.
const ORIGIN = { lng: -122.4005, lat: 37.7915 };
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const project = ([lng, lat]: [number, number]) => ({
	x: (lng - ORIGIN.lng) * M_PER_DEG_LNG,
	z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT
});

// Category colours from the original deck.gl getFillColor.
function fillColor(category: string | undefined, name: string | undefined, height: number) {
	if (category === 'historic_monument' && name?.includes('North Tower')) return [200, 220, 240];
	if (category === 'historic_monument' && name?.includes('South Tower')) return [220, 240, 255];
	switch (category) {
		case 'historic_monument':
			return [180, 200, 220];
		case 'office':
			return [160, 160, 160];
		case 'residential':
			return [180, 180, 180];
		case 'religious':
			return [140, 140, 140];
		case 'government':
			return [100, 100, 100];
		default: {
			const i = Math.min(140 + (height / 100) * 40, 200);
			return [i, i, i];
		}
	}
}

// Deterministic PRNG so the filler skyline is the same on every load.
function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export async function createSanFrancisco3D(
	container: HTMLElement,
	options: SfSceneOptions
): Promise<SfScene> {
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setClearColor(0x000000, 0);
	renderer.domElement.dataset.testid = 'sf3d-canvas';
	renderer.domElement.style.display = 'block';
	container.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(40, 1, 10, 20_000);

	scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
	const sun = new THREE.DirectionalLight(0xffffff, 1.6);
	sun.position.set(-800, 1400, 600);
	scene.add(sun);

	const disposables: { dispose(): void }[] = [];
	const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

	// Street grid as the ground plane (the original's basemap needed a MapTiler key).
	const grid = new THREE.GridHelper(6000, 60, 0x9ca3af, 0x9ca3af);
	const gridMaterial = grid.material as THREE.Material;
	gridMaterial.transparent = true;
	gridMaterial.opacity = 0.35;
	track(grid.geometry);
	track(gridMaterial);
	scene.add(grid);

	// Landmarks: extruded GeoJSON footprints, like deck.gl's GeoJsonLayer with extruded: true.
	const response = await fetch(options.dataUrl);
	if (!response.ok) throw new Error(`Failed to load building data: ${response.status}`);
	const data = (await response.json()) as BuildingCollection;
	if (!Array.isArray(data.features)) throw new Error('Invalid GeoJSON: missing features array');

	const edgeMaterial = track(
		new THREE.LineBasicMaterial({ color: 0x3c3c3c, transparent: true, opacity: 0.6 })
	);
	const landmarkCentres: { x: number; z: number }[] = [];
	for (const feature of data.features) {
		if (feature.geometry.type !== 'Polygon') continue;
		const ring = (feature.geometry.coordinates as Ring[])[0];
		const height = Math.max(feature.properties.height ?? 30, 5);
		const shape = new THREE.Shape(
			ring.map((p) => {
				const { x, z } = project(p);
				return new THREE.Vector2(x, -z);
			})
		);
		const geometry = track(
			new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
		);
		geometry.rotateX(-Math.PI / 2);
		const [r, g, b] = fillColor(feature.properties.category, feature.properties.name, height);
		const material = track(
			new THREE.MeshLambertMaterial({ color: new THREE.Color(`rgb(${r},${g},${b})`) })
		);
		const mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);
		const edges = track(new THREE.EdgesGeometry(geometry));
		scene.add(new THREE.LineSegments(edges, edgeMaterial));
		geometry.computeBoundingBox();
		const c = geometry.boundingBox!.getCenter(new THREE.Vector3());
		landmarkCentres.push({ x: c.x, z: c.z });
	}

	// Procedural filler: low-rise blocks on a street grid, taller toward the Financial District.
	const rand = mulberry32(1906);
	const block = 100;
	const span = 2200;
	const boxes: { x: number; z: number; w: number; d: number; h: number }[] = [];
	for (let gx = -span; gx <= span; gx += block) {
		for (let gz = -span; gz <= span; gz += block) {
			const dist = Math.hypot(gx, gz);
			if (dist > span) continue;
			for (let i = 0; i < 2; i++) {
				const x = gx + (rand() - 0.5) * (block - 40);
				const z = gz + (rand() - 0.5) * (block - 40);
				if (landmarkCentres.some((c) => Math.hypot(c.x - x, c.z - z) < 70)) continue;
				const core = Math.max(0, 1 - dist / 1100);
				const h = 8 + rand() * 25 + core * core * rand() * 130;
				boxes.push({ x, z, w: 18 + rand() * 22, d: 18 + rand() * 22, h });
			}
		}
	}
	const boxGeometry = track(new THREE.BoxGeometry(1, 1, 1));
	boxGeometry.translate(0, 0.5, 0);
	const fillerMaterial = track(new THREE.MeshLambertMaterial({ color: 0xd4d4d8 }));
	const filler = new THREE.InstancedMesh(boxGeometry, fillerMaterial, boxes.length);
	const m = new THREE.Matrix4();
	boxes.forEach((b, i) => {
		m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
		filler.setMatrixAt(i, m);
	});
	track(filler);
	scene.add(filler);

	// Camera: the original's view (pitch 60° from straight down, bearing -30°), orbiting slowly.
	const target = new THREE.Vector3(0, 60, 0);
	const pitch = (60 * Math.PI) / 180;
	const distance = 2300;
	let bearing = (-30 * Math.PI) / 180;
	const placeCamera = () => {
		const horizontal = distance * Math.sin(pitch);
		camera.position.set(
			target.x - horizontal * Math.sin(bearing),
			target.y + distance * Math.cos(pitch),
			target.z + horizontal * Math.cos(bearing)
		);
		camera.lookAt(target);
	};
	placeCamera();

	let disposed = false;
	let last = performance.now();
	const render = () => renderer.render(scene, camera);
	if (options.reducedMotion) {
		render();
	} else {
		renderer.setAnimationLoop((now) => {
			const dt = Math.min(now - last, 100);
			last = now;
			bearing += dt * 0.00002; // about one turn every 5 minutes
			placeCamera();
			render();
		});
	}

	return {
		resize(width, height) {
			if (disposed || width === 0 || height === 0) return;
			renderer.setSize(width, height, false);
			renderer.domElement.style.width = '100%';
			renderer.domElement.style.height = '100%';
			camera.aspect = width / height;
			// Shift the image down so the downtown skyline sits below the composer, not behind it.
			camera.setViewOffset(width, height, 0, -height * 0.22, width, height);
			camera.updateProjectionMatrix();
			if (options.reducedMotion) render();
		},
		dispose() {
			disposed = true;
			renderer.setAnimationLoop(null);
			for (const d of disposables) d.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		}
	};
}
