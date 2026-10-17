// TSL post-processing chain for the blueprint viewer: GTAO, SSGI, SSR and TRAA on top of a single
// MRT scene pass. Wiring follows the r186 webgpu_postprocessing_{ao,ssgi,ssr,traa} examples.
// createPost returns null when nothing is enabled or the graph fails to build, so the viewer can
// always fall back to renderer.render(scene, camera).
import {
	BlendMode,
	MaterialBlending,
	RenderPipeline,
	UnsignedByteType,
	type Node,
	type PerspectiveCamera,
	type Scene,
	type WebGPURenderer
} from 'three/webgpu';
import {
	add,
	convertToTexture,
	diffuseColor,
	float,
	materialOpacity,
	metalness,
	mrt,
	normalView,
	output,
	packNormalToRGB,
	pass,
	roughness,
	sample,
	unpackRGBToNormal,
	vec4,
	velocity
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import SSGINode from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import type { QualitySettings } from './quality.ts';

export type PostEffect = 'ao' | 'ssgi' | 'ssr' | 'taa';

export interface Post {
	render(): void;
	setEffect(name: PostEffect, on: boolean): void;
	effects(): Record<PostEffect, boolean>;
	dispose(): void;
}

interface Disposable {
	dispose(): void;
}

interface Graph {
	output: Node;
	disposables: Disposable[];
	usesTRAA: boolean;
}

type SetSize = (width: number, height: number) => void;

/**
 * SSGINode always traces at the drawing-buffer size. This subclass scales the size it is given,
 * which shrinks its render target and resolution uniform; the composite samples the GI texture
 * at screen UV, so it upsamples bilinearly.
 */
class ScaledSSGINode extends SSGINode {
	scale = 1;

	setSize(width: number, height: number) {
		const base = (SSGINode.prototype as unknown as { setSize: SetSize }).setSize;
		base.call(
			this,
			Math.max(1, Math.round(width * this.scale)),
			Math.max(1, Math.round(height * this.scale))
		);
	}
}

function buildGraph(
	scene: Scene,
	camera: PerspectiveCamera,
	on: Record<PostEffect, boolean>,
	halfRes: boolean
): Graph {
	const disposables: Disposable[] = [];
	const scenePass = pass(scene, camera);
	disposables.push(scenePass);

	const needNormal = on.ao || on.ssgi || on.ssr;

	// Glass is transparent with depthWrite off, so it never reaches the depth buffer. Its normal,
	// albedo, material and velocity would still overwrite the opaque surface behind it, because
	// non-output MRT attachments default to no blending. Writing alpha 0 for translucent
	// materials and using the material's own (normal) blending keeps the destination intact.
	const keep = materialOpacity.lessThan(1).select(float(0), float(1));
	const outputs: Record<string, Node> = { output };
	if (needNormal) outputs.normal = vec4(packNormalToRGB(normalView), keep);
	if (on.ssgi) outputs.diffuse = vec4(diffuseColor.rgb, keep);
	// WebGPU's default limit is 32 colour-attachment bytes per sample and every attachment here
	// costs 8, so at most four fit. With TAA on, roughness rides in velocity's spare channel and
	// SSR treats every surface as a dielectric (true for all our materials).
	const roughInVelocity = on.ssr && on.taa;
	if (on.ssr && !roughInVelocity) outputs.metalrough = vec4(metalness, roughness, float(0), keep);
	// velocity is typed as a bare VelocityNode; it is a vec2 in the shader.
	if (on.taa)
		outputs.velocity = vec4(
			velocity as unknown as Node<'vec2'>,
			roughInVelocity ? roughness : float(0),
			keep
		);

	const targets = mrt(outputs);
	for (const name of Object.keys(outputs)) {
		if (name !== 'output') targets.setBlendMode(name, new BlendMode(MaterialBlending));
	}
	scenePass.setMRT(targets);

	// Bandwidth: 8-bit is enough for packed normals, albedo and metal/rough.
	for (const name of ['normal', 'diffuse', 'metalrough']) {
		if (name in outputs) scenePass.getTexture(name).type = UnsignedByteType;
	}

	const color = scenePass.getTextureNode('output');
	const depth = scenePass.getTextureNode('depth');
	const normalTex = needNormal ? scenePass.getTextureNode('normal') : null;
	const normal = normalTex ? sample((uv) => unpackRGBToNormal(normalTex.sample(uv).rgb)) : null;

	let lit: Node<'vec3'> = color.rgb;

	// Ambient occlusion: GTAO multiplied into the lit colour.
	if (on.ao && normal) {
		const gtao = ao(depth, normal, camera);
		gtao.resolutionScale = 0.5;
		gtao.useTemporalFiltering = on.taa;
		disposables.push(gtao);
		lit = lit.mul(gtao.getTextureNode().r);
	}

	// Indirect light: SSGI's GI times albedo, added. Its own AO term is used only when GTAO is off,
	// so occlusion is never applied twice.
	if (on.ssgi && normal) {
		const gi = new ScaledSSGINode(convertToTexture(color), depth, normal, camera);
		gi.scale = halfRes ? 0.5 : 1;
		gi.useTemporalFiltering = on.taa;
		// Doc-comment presets: medium with temporal filtering, medium without.
		gi.sliceCount.value = on.taa ? 2 : 3;
		gi.stepCount.value = 8;
		disposables.push(gi);
		if (!on.ao) lit = lit.mul(gi.getAONode());
		const albedo = scenePass.getTextureNode('diffuse');
		lit = add(lit, albedo.rgb.mul(gi.getGINode().rgb));
	}

	// Reflections: SSR outputs premultiplied colour, so it is added (as in the r186 example).
	// Every material here is a dielectric, hence reflectNonMetals.
	if (on.ssr && normal) {
		const metalRough = scenePass.getTextureNode(roughInVelocity ? 'velocity' : 'metalrough');
		const reflection = ssr(color, depth, normal, {
			metalnessNode: roughInVelocity ? float(0) : metalRough.r,
			roughnessNode: roughInVelocity ? metalRough.b : metalRough.g,
			reflectNonMetals: true,
			camera
		});
		reflection.resolutionScale = halfRes ? 0.5 : 1;
		disposables.push(reflection);
		lit = add(lit, reflection.rgb);
	}

	let result: Node = vec4(lit, color.a);

	// Temporal reprojection AA last; it jitters the camera itself and expects MSAA off.
	if (on.taa) {
		const aa = traa(result, depth, scenePass.getTextureNode('velocity'), camera);
		disposables.push(aa);
		result = aa;
	}

	return { output: result, disposables, usesTRAA: on.taa };
}

export function createPost(
	renderer: WebGPURenderer,
	scene: Scene,
	camera: PerspectiveCamera,
	settings: QualitySettings
): Post | null {
	const state: Record<PostEffect, boolean> = {
		ao: settings.post.ao,
		ssgi: settings.post.ssgi,
		ssr: settings.post.ssr,
		taa: settings.post.taa
	};
	if (!Object.values(state).some(Boolean)) return null;

	const halfRes = settings.post.halfResGI;
	let pipeline: RenderPipeline | null = null;
	let graph: Graph | null = null;
	let failed = false;

	function teardownGraph() {
		if (!graph) return;
		for (const d of graph.disposables) d.dispose();
		if (graph.usesTRAA) camera.clearViewOffset();
		graph = null;
	}

	function rebuild() {
		teardownGraph();
		if (!Object.values(state).some(Boolean)) return;
		graph = buildGraph(scene, camera, state, halfRes);
		pipeline ??= new RenderPipeline(renderer);
		pipeline.outputNode = graph.output;
		pipeline.needsUpdate = true;
	}

	try {
		rebuild();
	} catch (err) {
		console.warn('[post] disabled, pipeline build failed:', err);
		teardownGraph();
		(pipeline as RenderPipeline | null)?.dispose();
		return null;
	}

	return {
		render() {
			if (failed || !pipeline || !graph) {
				renderer.render(scene, camera);
				return;
			}
			try {
				pipeline.render();
			} catch (err) {
				console.warn('[post] disabled, render failed:', err);
				failed = true;
				teardownGraph();
				renderer.render(scene, camera);
			}
		},
		setEffect(name, on) {
			if (state[name] === on) return;
			state[name] = on;
			if (failed) return;
			try {
				rebuild();
			} catch (err) {
				console.warn(`[post] disabled, rebuild after toggling ${name} failed:`, err);
				failed = true;
				teardownGraph();
			}
		},
		effects() {
			return { ...state };
		},
		dispose() {
			teardownGraph();
			pipeline?.dispose();
			pipeline = null;
		}
	};
}
