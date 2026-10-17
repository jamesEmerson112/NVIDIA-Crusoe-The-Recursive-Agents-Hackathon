// Bright daylight for the blueprint viewer, styled after real-estate 3D floor plans: a high, slightly
// warm sun with soft shadows, a bright sky fill and (on High) image-based light with neutral tone mapping.
// Plan +y (three -z) is treated as north, so west is -x and south is +z.
import {
	Box3,
	DirectionalLight,
	HemisphereLight,
	NeutralToneMapping,
	NoToneMapping,
	PCFShadowMap,
	PMREMGenerator,
	Scene,
	Vector3,
	WebGPURenderer
} from 'three/webgpu';
import type { RenderTarget } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { QualitySettings } from './quality.ts';

export interface Lighting {
	fitTo(box: Box3): void;
	setShadows(on: boolean): void;
	dispose(): void;
}

const SUN_ELEVATION = (52 * Math.PI) / 180;
const SUN_AZIMUTH = (205 * Math.PI) / 180; // south-southwest, clockwise from north
/** Unit vector from the scene towards the sun. */
const SUN_DIR = new Vector3(
	Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
	Math.sin(SUN_ELEVATION),
	-Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION)
).normalize();

export function createLighting(
	scene: Scene,
	renderer: WebGPURenderer,
	settings: QualitySettings
): Lighting {
	const high = settings.environment || settings.shadows || settings.toneMapping === 'neutral';

	// Low has no environment or tone mapping, so the fill carries more of the load (the sun grazes
	// floors at 12°, so horizontal surfaces are lit mostly by the hemisphere).
	const hemi = new HemisphereLight('#f4f7ff', '#d6cfc4', high ? 1.1 : 1.6);
	const sun = new DirectionalLight('#fff1dd', high ? 2.6 : 1.8);
	sun.name = 'sun';
	sun.position.copy(SUN_DIR).multiplyScalar(20);
	scene.add(hemi, sun, sun.target);

	const shadow = sun.shadow;
	const size = settings.shadowMapSize > 0 ? settings.shadowMapSize : 2048;
	shadow.mapSize.set(size, size);
	shadow.bias = -0.0005;
	shadow.normalBias = 0.02;
	// WebGPURenderer 0.186 removed PCFSoftShadowMap; PCFShadowMap samples a Vogel disk scaled by
	// `radius`, which is the soft filter it supports.
	shadow.radius = 3;
	renderer.shadowMap.type = PCFShadowMap;

	const setShadows = (on: boolean) => {
		renderer.shadowMap.enabled = on;
		sun.castShadow = on;
	};
	setShadows(settings.shadows);

	let envTarget: RenderTarget | null = null;
	if (settings.environment) {
		const pmrem = new PMREMGenerator(renderer);
		const room = new RoomEnvironment();
		envTarget = pmrem.fromScene(room, 0.04);
		room.dispose();
		pmrem.dispose();
		scene.environment = envTarget.texture;
		scene.environmentIntensity = 0.9;
	}

	if (settings.toneMapping === 'neutral') {
		// Khronos PBR Neutral keeps materials' true colours (AgX greyed the scene out).
		renderer.toneMapping = NeutralToneMapping;
		renderer.toneMappingExposure = 1.0;
	} else {
		renderer.toneMapping = NoToneMapping;
		renderer.toneMappingExposure = 1;
	}

	const center = new Vector3();
	const corner = new Vector3();
	const fitTo = (box: Box3) => {
		if (box.isEmpty()) return;
		box.getCenter(center);
		const radius = Math.max(box.getSize(corner).length() / 2, 1);
		sun.position
			.copy(SUN_DIR)
			.multiplyScalar(radius * 3)
			.add(center);
		sun.target.position.copy(center);
		sun.updateMatrixWorld();
		sun.target.updateMatrixWorld();

		// Mirror LightShadow.updateMatrices, then wrap the box's corners in light space.
		const cam = shadow.camera;
		cam.position.copy(sun.position);
		cam.lookAt(center);
		cam.updateMatrixWorld();
		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity,
			maxX = -Infinity,
			maxY = -Infinity,
			maxZ = -Infinity;
		for (let i = 0; i < 8; i++) {
			corner
				.set(
					i & 1 ? box.max.x : box.min.x,
					i & 2 ? box.max.y : box.min.y,
					i & 4 ? box.max.z : box.min.z
				)
				.applyMatrix4(cam.matrixWorldInverse);
			minX = Math.min(minX, corner.x);
			maxX = Math.max(maxX, corner.x);
			minY = Math.min(minY, corner.y);
			maxY = Math.max(maxY, corner.y);
			minZ = Math.min(minZ, corner.z);
			maxZ = Math.max(maxZ, corner.z);
		}
		const pad = 0.25;
		cam.left = minX - pad;
		cam.right = maxX + pad;
		cam.bottom = minY - pad;
		cam.top = maxY + pad;
		// The camera looks down -z, so distances in front of it are -z.
		cam.near = Math.max(0.05, -maxZ - pad);
		cam.far = -minZ + pad;
		cam.updateProjectionMatrix();
	};

	return {
		fitTo,
		setShadows,
		dispose() {
			scene.remove(hemi, sun, sun.target);
			sun.dispose();
			hemi.dispose();
			if (envTarget) {
				if (scene.environment === envTarget.texture) scene.environment = null;
				envTarget.dispose();
				envTarget = null;
			}
		}
	};
}
