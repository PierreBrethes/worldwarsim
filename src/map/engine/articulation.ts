import { type Object3D } from 'three';
import { STEP_MS, stepBounds, type ReplayFrame } from '@/domain/replay';
import type { UnitTier } from '@/domain/troops';

/**
 * **Ce que bougent les pièces articulées d'un combat** (#331, storyboard `commun/combat.js:331-353`) :
 * la tourelle pivote vers sa cible, le tube recule dans son axe. Les valeurs sont celles du
 * storyboard validé le 31/10, `@a-mesurer`.
 */
export type GunKind = 'armor' | 'artillery';

type Gun = {
  /** Le recul de la pièce entière, en part de sa longueur. */
  readonly piece: number;
  /** Le recul du tube dans son axe, en mètres du modèle. */
  readonly tube: number;
  /** Le cabrage de la pièce au coup, en degrés. */
  readonly rock: number;
  /** La hausse du tube, en radians. */
  readonly elevation: number;
};
export const GUNS: Readonly<Record<GunKind, Gun>> = {
  armor: { piece: 0.02, tube: 0.14, rock: -2, elevation: 0.04 },
  artillery: { piece: 0.08, tube: 0.35, rock: -3, elevation: 0.1 },
};

/** **Le L3/35 n'a pas de tourelle** : son affût tourne dans ce débattement, en radians. */
const MOUNT_ARC = (12 * Math.PI) / 180;
export const turretLimitOf = (nation: string | null, tier: UnitTier): number | null =>
  nation === 'italy' && tier === 1 ? MOUNT_ARC : null;

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
export const smooth = (k: number) => k * k * (3 - 2 * k);
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));

/** Le tube part en 80 ms, revient en 0,5 s. */
const KICK_MS = 80;
const RETURN_MS = 500;
/** Le recul à `sinceMs` du départ du coup : 0, 1 au bout du tube, 0. `null` : pas de coup. */
export function recoilAt(sinceMs: number | null): number {
  if (sinceMs === null || sinceMs <= 0) return 0;
  if (sinceMs < KICK_MS) return sinceMs / KICK_MS;
  return Math.max(0, 1 - (sinceMs - KICK_MS) / RETURN_MS) ** 2;
}

/** Les pièces prennent la pose en 0,6 s, la quittent entre 0,2 et 0,8 s du compte-rendu. */
const SETTLE_MS = 600;

/** Où la scène en est depuis son départ, en ms. */
const clockOf = (frame: ReplayFrame): number =>
  stepBounds(frame.step).start + frame.progress * STEP_MS[frame.step];

/** **À quel point les pièces sont en joue** : 0 au repos, 1 de la pose au compte-rendu. */
export function readyOf(frame: ReplayFrame): number {
  const at = clockOf(frame);
  const pose = stepBounds('pose').start;
  const report = stepBounds('compte-rendu').start;
  return (
    smooth(span(at, pose, pose + SETTLE_MS)) * (1 - smooth(span(at, report + 200, report + 800)))
  );
}

/** Un angle ramené à ]-π, π] : la tourelle tourne au plus court. */
export const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

type Rest = { readonly y: number; readonly rx: number; readonly py: number; readonly pz: number };

/**
 * **La tourelle et le tube d'une copie articulée** (`RIG_PARTS`). Chaque nœud revient exactement
 * à son repos quand la pièce n'est plus en joue ; un nœud absent — le L3/35 n'a pas de tube
 * séparé de son affût, l'artillerie pas de tourelle — n'est simplement pas bougé.
 */
export class Guns {
  private readonly turret: Object3D | undefined;
  private readonly tube: Object3D | undefined;
  private readonly rest = new Map<Object3D, Rest>();

  constructor(
    root: Object3D,
    private readonly kind: GunKind,
    private readonly limit: number | null,
  ) {
    this.turret = root.getObjectByName('turret');
    this.tube = root.getObjectByName(kind === 'armor' ? 'gun' : 'barrel');
    for (const node of [this.turret, this.tube])
      if (node)
        this.rest.set(node, {
          y: node.rotation.y,
          rx: node.rotation.x,
          py: node.position.y,
          pz: node.position.z,
        });
  }

  /**
   * `aim` : l'écart de la cible à l'axe de la pièce, en radians ; `ready` et `turretReady` : la
   * part de pose tenue (la tourelle se remet dans l'axe avant le tube) ; `recoil` : 0..1.
   */
  point(aim: number, ready: number, turretReady: number, recoil: number): void {
    const { elevation, tube } = GUNS[this.kind];
    if (this.turret) {
      const rest = this.rest.get(this.turret)!;
      const turn = this.limit === null ? aim : Math.max(-this.limit, Math.min(this.limit, aim));
      this.turret.rotation.y = rest.y + turn * turretReady;
    }
    if (this.tube) {
      const rest = this.rest.get(this.tube)!;
      const raised = elevation * ready;
      this.tube.rotation.x = rest.rx - raised;
      this.tube.position.y = rest.py - tube * recoil * Math.sin(raised);
      this.tube.position.z = rest.pz - tube * recoil * Math.cos(raised);
    }
  }
}
