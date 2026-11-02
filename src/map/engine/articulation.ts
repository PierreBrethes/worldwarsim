import { Group, Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { STEP_MS, stepBounds, type ReplayFrame } from '@/domain/replay';
import type { UnitTier } from '@/domain/troops';

/**
 * **Ce que bougent les pièces articulées d'un combat** (#331, storyboard `commun/combat.js:331-353`) :
 * la tourelle pivote vers sa cible, le tube recule dans son axe. Les valeurs sont celles du
 * storyboard validé le 31/10, `@a-mesurer`.
 */
export type GunKind = 'armor' | 'artillery' | 'escort';

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
  // L'escorteur (#324) : 0,8 m de recul du tube, 0,4 % de la coque, pas de cabrage.
  escort: { piece: 0.004, tube: 0.8, rock: 0, elevation: 0.14 },
};

/** **Le L3/35 n'a pas de tourelle** : son affût tourne dans ce débattement, en radians. */
const MOUNT_ARC = (12 * Math.PI) / 180;
/** **Une tourelle de navire ne tire pas à travers sa passerelle** (#324) : ± 150° de son repos. */
const DECK_ARC = (150 * Math.PI) / 180;
export const turretLimitOf = (
  nation: string | null,
  tier: UnitTier,
  kind: GunKind = 'armor',
): number | null =>
  kind === 'escort' ? DECK_ARC : nation === 'italy' && tier === 1 ? MOUNT_ARC : null;

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
export const clockOf = (frame: ReplayFrame): number =>
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

type Rest = { readonly rx: number; readonly py: number; readonly pz: number };

/**
 * **Le repos d'une tourelle, en lacet** : lu sur son quaternion. Les tourelles arrière d'un
 * GLB portent un demi-tour que three décompose en (π, 0, π) — `rotation.y` y lit 0.
 */
type Turret = { readonly at: Quaternion; readonly yaw: number };
const UP = new Vector3(0, 1, 0);
const turn = new Quaternion();

/** Une tourelle et son tube : la tourelle peut manquer (l'artillerie), le tube aussi (le L3/35). */
type Pair = { readonly turret: Object3D | undefined; readonly tube: Object3D | undefined };

function pairsOf(root: Object3D, kind: GunKind): Pair[] {
  if (kind !== 'escort')
    return [
      {
        turret: root.getObjectByName('turret'),
        tube: root.getObjectByName(kind === 'armor' ? 'gun' : 'barrel'),
      },
    ];
  const pairs: Pair[] = [];
  for (let n = 1; root.getObjectByName(`gun_${n}`) !== undefined; n++)
    pairs.push({
      turret: root.getObjectByName(`turret_${n}`),
      tube: root.getObjectByName(`gun_${n}`),
    });
  return pairs;
}

/**
 * **La bouche du tube `n`** (1 d'abord) : `fx_muzzle_n` du modèle, sinon le `fx_muzzle` de
 * `gun_1`, sinon le bout de sa géométrie, à la hauteur du tube — un repère posé là.
 */
function muzzleOf(root: Object3D, n: number, tube: Object3D): Object3D {
  const named =
    root.getObjectByName(`fx_muzzle_${n}`) ??
    (n === 1 ? tube.getObjectByName('fx_muzzle') : undefined);
  if (named !== undefined) return named;
  let tip = 0;
  tube.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    part.geometry.computeBoundingBox();
    tip = Math.max(tip, part.geometry.boundingBox!.max.z);
  });
  const marker = new Group();
  marker.position.z = tip;
  tube.add(marker);
  return marker;
}

/**
 * **Les tourelles et les tubes d'une copie articulée** (`RIG_PARTS`), par paires. Chaque nœud
 * revient exactement à son repos quand la pièce n'est plus en joue ; un nœud absent n'est
 * simplement pas bougé. Une tourelle vise depuis son propre repos : celle de l'arrière part dos
 * à l'avant.
 */
export class Guns {
  private readonly pairs: ReadonlyArray<Pair>;
  private readonly rest = new Map<Object3D, Rest>();
  private readonly turrets = new Map<Object3D, Turret>();
  /** Une bouche par tube, dans l'ordre des paires : ce qui y fait l'éclair et la fumée. */
  readonly muzzles: ReadonlyArray<Object3D>;

  constructor(
    root: Object3D,
    private readonly kind: GunKind,
    private readonly limit: number | null,
  ) {
    this.pairs = pairsOf(root, kind);
    for (const { turret, tube } of this.pairs) {
      if (turret) {
        const { y, w } = turret.quaternion;
        this.turrets.set(turret, { at: turret.quaternion.clone(), yaw: 2 * Math.atan2(y, w) });
      }
      if (tube)
        this.rest.set(tube, { rx: tube.rotation.x, py: tube.position.y, pz: tube.position.z });
    }
    this.muzzles = this.pairs.flatMap(({ tube }, j) =>
      tube === undefined ? [] : [muzzleOf(root, j + 1, tube)],
    );
  }

  /**
   * `aim` : l'écart de la cible à l'axe de la pièce, en radians ; `ready` et `turretReady` : la
   * part de pose tenue (la tourelle se remet dans l'axe avant le tube) ; `recoilOf(j)` : le recul
   * du tube `j`, 0..1.
   */
  point(aim: number, ready: number, turretReady: number, recoilOf: (j: number) => number): void {
    const { elevation, tube: kick } = GUNS[this.kind];
    this.pairs.forEach(({ turret, tube }, j) => {
      if (turret) {
        const rest = this.turrets.get(turret)!;
        const off = wrap(aim - rest.yaw);
        const by = this.limit === null ? off : Math.max(-this.limit, Math.min(this.limit, off));
        turret.quaternion.copy(rest.at).multiply(turn.setFromAxisAngle(UP, by * turretReady));
      }
      if (tube) {
        const rest = this.rest.get(tube)!;
        const raised = elevation * ready;
        const recoil = recoilOf(j);
        tube.rotation.x = rest.rx - raised;
        tube.position.y = rest.py - kick * recoil * Math.sin(raised);
        tube.position.z = rest.pz - kick * recoil * Math.cos(raised);
      }
    });
  }
}
