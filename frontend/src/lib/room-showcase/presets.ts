/** Camera presets for the showcase room. Units are metres; the room spans x -2.5..2.5, z -3..3. */
export interface CameraPreset {
	id: string;
	label: string;
	position: [number, number, number];
	target: [number, number, number];
	fov: number;
}

export const ROOM = { width: 5, depth: 6, height: 2.7 } as const;

export const CAMERA_PRESETS: CameraPreset[] = [
	{
		id: 'listing',
		label: 'Listing photo',
		position: [2.15, 1.35, 2.75],
		target: [-0.9, 0.8, -1.6],
		fov: 58
	},
	{
		id: 'window',
		label: 'Window light',
		position: [-2.1, 1.3, 0.9],
		target: [1.2, 0.9, -1.6],
		fov: 60
	},
	{
		id: 'dining',
		label: 'Dining corner',
		position: [0.9, 1.4, -0.3],
		target: [-1.3, 0.75, 2.1],
		fov: 56
	}
];

export function presetById(id: string): CameraPreset {
	return CAMERA_PRESETS.find((p) => p.id === id) ?? CAMERA_PRESETS[0];
}
