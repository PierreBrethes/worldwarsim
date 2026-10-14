/**
 * **L'objectif du prototype, à l'essai** (14/10/2026) : un téléobjectif de 28° et le tone mapping
 * ACES de `table-etat-major.html`, derrière un réglage pour que Pierre compare. La caméra de jeu
 * reste celle de 42° et tout ce qui se mesure à sa distance — fondu des régions, figurines,
 * pente, ombre, tilt-shift — ne bouge pas : l'œil qui rend recule seulement de quoi cadrer le
 * même plan regardé, et la perspective s'aplatit autour.
 */
export type CameraLens = 'game' | 'poc';
export const CAMERA_LENSES: ReadonlyArray<CameraLens> = ['game', 'poc'];
export const DEFAULT_CAMERA_LENS: CameraLens = 'game';
export const isCameraLens = (value: unknown): value is CameraLens =>
  CAMERA_LENSES.includes(value as CameraLens);

export const LENS_FOV: Record<CameraLens, number> = { game: 42, poc: 28 };

const halfTan = (fov: number): number => Math.tan((fov * Math.PI) / 360);

export const eyeDistanceFactor = (lens: CameraLens): number =>
  halfTan(LENS_FOV.game) / halfTan(LENS_FOV[lens]);
