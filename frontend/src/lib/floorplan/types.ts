// Blueprint format for apartment units (docs/research/floorplan-2d-to-3d.md, §4).
// Units are metres; plan x is east, plan y is north. The 3D viewer maps plan (x, y) to three (x, -z).

export type Point = [number, number];

export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'hall' | 'utility';

export interface Wall {
	id: string;
	a: Point;
	b: Point;
	/** Thickness. */
	t: number;
	exterior: boolean;
	/** Shared with a neighbouring unit. */
	party: boolean;
}

export interface Opening {
	id: string;
	wallId: string;
	/** Centre of the opening along the wall, 0 at `a` and 1 at `b`. */
	pos: number;
	/** Width, height and sill height. */
	w: number;
	h: number;
	sill: number;
	kind: 'door' | 'window';
}

export interface Room {
	id: string;
	name: string;
	type: RoomType;
	polygon: Point[];
}

export interface Furniture {
	id: string;
	type: string;
	room: string;
	/** Centre in plan coordinates. */
	x: number;
	y: number;
	/** Size along plan x, plan y, and height, before rotation. */
	w: number;
	d: number;
	h: number;
	/** Counter-clockwise rotation in degrees. */
	rot: number;
}

export interface Story {
	level: number;
	elevation: number;
	height: number;
	walls: Wall[];
	openings: Opening[];
	rooms: Room[];
	furniture: Furniture[];
}

export interface Plan {
	id: string;
	name: string;
	/** True for hand-made or generated layouts that are not real surveyed plans. */
	synthetic: boolean;
	origin: Point;
	stories: Story[];
}
