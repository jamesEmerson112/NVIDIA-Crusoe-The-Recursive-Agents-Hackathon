// Real 3D San Francisco for the start page: MapTiler vector tiles + terrain drawn with MapLibre.
// Same default view as PulsePoint SF's SanFrancisco3D.js (downtown, 60° pitch, -30° bearing,
// terrain on), but with a light minimal style so the start page stays readable, extruded
// buildings from the `building` layer's render_height, and a slow ambient drift. Needs
// PUBLIC_MAPTILER_KEY; without it SanFrancisco3D.svelte uses the keyless three.js skyline
// (scene.ts). Load this module with a dynamic import from onMount.
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre finds its worker next to its own module, which Vite's dependency bundling moves;
// point it at the packaged worker explicitly.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { SfScene } from './scene.ts';

export interface SfMapOptions {
	apiKey: string;
	reducedMotion: boolean;
}

const VIEW = {
	center: [-122.3935, 37.7815] as [number, number],
	zoom: 13.9,
	pitch: 60,
	bearing: -30
};
// Degrees of bearing per second for the ambient drift (a full turn takes ~10 minutes).
const DRIFT_DEG_PER_S = 0.6;

export function createSanFranciscoMap(host: HTMLElement, options: SfMapOptions): Promise<SfScene> {
	setWorkerUrl(workerUrl);
	const key = encodeURIComponent(options.apiKey);
	const map = new MapLibreMap({
		container: host,
		style: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`,
		...VIEW,
		maxPitch: 75,
		interactive: false,
		attributionControl: false,
		fadeDuration: 0
	});
	map.getCanvas().dataset.testid = 'sf3d-map-canvas';

	let frame = 0;
	let disposed = false;
	const scene: SfScene = {
		resize: () => map.resize(),
		dispose() {
			if (disposed) return;
			disposed = true;
			cancelAnimationFrame(frame);
			map.remove();
		}
	};

	return new Promise((resolve, reject) => {
		let loaded = false;
		map.on('error', (event) => {
			if (loaded) return console.warn('SF map:', event.error?.message ?? event);
			scene.dispose();
			reject(event.error ?? new Error('MapTiler style failed to load'));
		});

		map.on('load', () => {
			loaded = true;
			if (disposed) return;
			const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

			map.addSource('sf3d-terrain', {
				type: 'raster-dem',
				url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
				tileSize: 256
			});
			map.setTerrain({ source: 'sf3d-terrain', exaggeration: 1.4 });
			map.addLayer(
				{
					id: 'sf3d-hillshade',
					type: 'hillshade',
					source: 'sf3d-terrain',
					paint: {
						'hillshade-shadow-color': 'hsl(220, 15%, 55%)',
						'hillshade-highlight-color': 'hsl(0, 0%, 100%)',
						'hillshade-exaggeration': 0.35
					}
				},
				firstLabel
			);
			map.addLayer(
				{
					id: 'sf3d-buildings',
					type: 'fill-extrusion',
					source: 'maptiler_planet',
					'source-layer': 'building',
					minzoom: 13,
					paint: {
						'fill-extrusion-color': [
							'interpolate',
							['linear'],
							['coalesce', ['get', 'render_height'], 0],
							0,
							'hsl(35, 10%, 82%)',
							60,
							'hsl(215, 14%, 72%)',
							200,
							'hsl(215, 22%, 60%)'
						],
						'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
						'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
						'fill-extrusion-opacity': 0.92,
						'fill-extrusion-vertical-gradient': true
					}
				},
				firstLabel
			);

			if (!options.reducedMotion) {
				let last = performance.now();
				const tick = (now: number) => {
					const dt = Math.min(now - last, 100) / 1000;
					last = now;
					if (!document.hidden) map.setBearing(map.getBearing() + DRIFT_DEG_PER_S * dt);
					frame = requestAnimationFrame(tick);
				};
				frame = requestAnimationFrame(tick);
			}
			resolve(scene);
		});
	});
}
