import { Box3, Euler, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { isRigPart, type RigFamily } from '@/emblems/rigs';
import type { AmbientLayer } from './ambience';
import type { RestPose } from './figurines/figurine';
import { articulatedOf, type SequenceHost } from './sequences';
import { craneAt, domeAt, type Flat, headframeAt, pumpAt } from './timelines/at-rest';

/** **Une pièce lisible** (#273) : la boucle joue tant que sa pièce mobile fait au moins tant de
 *  px à l'écran, sur la fenêtre de référence de 900 px. `@a-mesurer` */
export const LIVE_PX = 6;
/** **Au plus tant de sites vivants à la fois**, les plus proches de l'œil ; au-delà, le repos.
 *  Hors du `MAX_PLAYING` des séquences. `@a-mesurer` */
export const MAX_LIVING = { desk: 6, touch: 3 } as const;

type Vec3 = readonly [x: number, y: number, z: number];
/** **L'écart d'une pièce à son repos**, dans le repère de son parent ; `stretch` allonge son y (le
 *  câble de la grue). */
type PartPose = { readonly turn?: Vec3; readonly shift?: Vec3; readonly stretch?: number };
type LoopPose = Readonly<Record<string, PartPose>>;

/** **La boucle d'un fichier** : la famille de sa copie articulée, la taille en mètres de la pièce
 *  qui doit se lire, et ses poses, lues une fois sur la copie (pivots et repères). */
type SiteLoop = {
  readonly family: RigFamily;
  readonly part: number;
  posesOf(rig: Object3D): (seconds: number) => LoopPose;
};

const world = (node: Object3D): Vector3 => node.getWorldPosition(new Vector3());
const yz = (v: Vector3): Flat => [v.y, v.z];
const named = (rig: Object3D, name: string): Object3D => {
  const node = rig.getObjectByName(name);
  if (node === undefined) throw new Error(`boucle : ${name} manque`);
  return node;
};

/** **Le pied de bielle au repos** : `fx_maneton`, ou faute de repère le bas de sa géométrie,
 *  au milieu de sa section (le GLB d'avant #368). */
function pinOf(rig: Object3D, rod: Object3D, marker: string): Vector3 {
  const pin = rig.getObjectByName(marker);
  if (pin !== undefined) return world(pin);
  const box = new Box3();
  for (const child of rod.children) {
    const { geometry } = child as Mesh;
    if (geometry === undefined) continue;
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  const foot = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  return rod.localToWorld(foot);
}

const PUMP: SiteLoop = {
  family: 'oilWell',
  part: 7,
  posesOf(rig) {
    rig.updateMatrixWorld(true);
    const beam = world(named(rig, 'balancier'));
    const rods = (['bielle', 'bielle_2'] as const).map((name, k) => {
      const rod = named(rig, name);
      // A second arm without its own pin shares the first's.
      const marker = k > 0 && rig.getObjectByName('fx_maneton_2') ? 'fx_maneton_2' : 'fx_maneton';
      return { name, head: yz(world(rod)), pin: yz(pinOf(rig, rod, marker)) };
    });
    const frame = {
      crank: yz(world(named(rig, 'manivelle'))),
      beam: yz(beam),
      arm: world(named(rig, 'tige')).z - beam.z,
      rods,
    };
    return (seconds) => {
      const { crank, beam: rock, rods: moved, rod } = pumpAt(seconds, frame);
      const pose: Record<string, PartPose> = {
        manivelle: { turn: [crank, 0, 0] },
        balancier: { turn: [rock, 0, 0] },
        tige: { shift: [0, rod, 0] },
      };
      moved.forEach(({ shift, turn }, k) => {
        pose[rods[k]!.name] = { shift: [0, ...shift], turn: [turn, 0, 0] };
      });
      return pose;
    };
  },
};

/** **La cordée et le wagonnet** : la même boucle aux deux mines, la course en mètres seule change. */
const headframe = (course: number): SiteLoop => ({
  family: 'mine',
  part: 4,
  posesOf: () => (seconds) => {
    const { wheel, cart, bin } = headframeAt(seconds);
    return {
      molette_1: { turn: [wheel, 0, 0] },
      molette_2: { turn: [-wheel, 0, 0] },
      wagonnet: { shift: [course * cart, 0, 0] },
      wagonnet_caisse: { turn: [bin, 0, 0] },
    };
  },
});

const DOME: SiteLoop = {
  family: 'researchCenter',
  part: 8,
  posesOf: () => (seconds) => {
    const { yaw, lens } = domeAt(seconds);
    return { coupole: { turn: [0, yaw, 0] }, lunette: { turn: [-lens, 0, 0] } };
  },
};

const CRANE: SiteLoop = {
  family: 'port',
  part: 45,
  posesOf(rig) {
    rig.updateMatrixWorld(true);
    const ring = named(rig, 'grue_couronne');
    const cable = named(rig, 'cable');
    // Its head: `fx_tete_fleche`, or the top of the cable that hangs from it (before #368).
    const marker = rig.getObjectByName('fx_tete_fleche');
    const head = marker === undefined ? cable.position.clone() : ring.worldToLocal(world(marker));
    const frame = {
      foot: [named(rig, 'fleche').position.x, named(rig, 'fleche').position.y] as Flat,
      head: [head.x, head.y] as Flat,
      cable: cable.position.y - named(rig, 'crochet').position.y,
      height: ring.position.y,
    };
    return (seconds) => {
      const {
        slew,
        lift,
        head: [x, y],
        cable: length,
      } = craneAt(seconds, frame);
      const [dx, dy] = [x - frame.head[0], y - frame.head[1]];
      return {
        grue_couronne: { turn: [0, slew, 0] },
        fleche: { turn: [0, 0, -lift] },
        cable: { shift: [dx, dy, 0], stretch: length / frame.cable },
        crochet: { shift: [dx, dy - (length - frame.cable), 0] },
      };
    };
  },
};

/** **Quel fichier a sa boucle** : le puits, les deux mines, le Centre, le chantier naval. */
const LOOPS = new Map<string | null, SiteLoop>([
  [buildingMaquette('oilWell', null), PUMP],
  [buildingMaquette('mine', null), headframe(10)],
  [buildingMaquette('mine', 'coal'), headframe(8)],
  [buildingMaquette('researchCenter', null), DOME],
  [buildingMaquette('port', null), CRANE],
]);
export const loopOf = (url: string): SiteLoop | undefined => LOOPS.get(url);

/** **Ce qu'un hôte offre à la boucle** : ses sites au travail dessinés entiers (diorama debout),
 *  leur boîte dans le monde et ses unités de plateau par mètre. */
export type LoopHost = SequenceHost & {
  working(): ReadonlyArray<{
    readonly id: string;
    readonly url: string;
    readonly pose?: RestPose;
    readonly box: Box3;
    readonly metre: number;
  }>;
};

type Rest = {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
};
type Living = {
  readonly url: string;
  readonly pose: RestPose | undefined;
  copy: Object3D | null;
  parts: Map<string, { readonly node: Object3D; readonly rest: Rest }>;
  poses: ((seconds: number) => LoopPose) | null;
  over: boolean;
};

const turn = new Quaternion();
const euler = new Euler();
const partBox = new Box3();
const centre = new Vector3();

/**
 * **Les sites au repos vivent** (#273, ADR 0036 §12) : une couche d'ambiance qui emprunte à son
 * hôte la copie articulée de chaque site vivant et la pose à son pas, sans jamais demander plus
 * que ses images d'ambiance. Vit : un site au travail dessiné entier, dans le champ, dont la
 * pièce mobile se lit, parmi les plus proches de l'œil (`cap`), en mouvement plein. Une séquence
 * qui joue sur le site l'emporte : la boucle lui cède la copie, et reprend la sienne à son temps
 * d'horloge quand la séquence la rend. Les pièces mobiles ne portent pas d'ombre : une image
 * d'ambiance ne refait pas la carte d'ombres.
 */
export class SiteLoopLayer implements AmbientLayer {
  readonly fx = 'sites';
  /** Le pas de la fumée des usines : un site qui fume et vit ne demande rien de plus. */
  readonly hz = 8;
  private readonly living = new Map<string, Living>();
  private time = 0;

  constructor(
    private readonly host: LoopHost,
    private readonly sequences: { playsOn(host: SequenceHost, id: string): boolean },
    /** Ce que voit l'œil : la boîte coupe le champ, et fait au moins `px`. */
    private readonly sees: (box: Box3, px: number) => boolean,
    private readonly eye: () => Vector3,
    private readonly cap: number,
    private readonly cook: (
      url: string,
      family: RigFamily,
      pose?: RestPose,
    ) => Promise<Object3D> = articulatedOf,
  ) {}

  idle(): boolean {
    return this.living.size === 0 && this.chosen().length === 0;
  }

  frame(seconds: number, motion: MapMotion): void {
    this.time = seconds;
    const chosen = new Map(
      (motion === 'full' ? this.chosen() : []).map((site) => [site.id, site] as const),
    );
    for (const [id, life] of this.living) {
      const site = chosen.get(id);
      if (site === undefined || site.url !== life.url || site.pose !== life.pose)
        this.release(id, life);
    }
    for (const site of chosen.values()) if (!this.living.has(site.id)) this.take(site);
    for (const life of this.living.values()) this.pose(life);
  }

  /** How many sites live now: what the banc reads. */
  get size(): number {
    return [...this.living.values()].filter(({ copy }) => copy !== null).length;
  }

  dispose(): void {
    for (const [id, life] of this.living) this.release(id, life);
  }

  private chosen() {
    const eye = this.eye();
    return this.host
      .working()
      .filter(({ id, url, box, metre }) => {
        const loop = loopOf(url);
        if (loop === undefined || this.sequences.playsOn(this.host, id) || !this.sees(box, 0))
          return false;
        const half = (loop.part * metre) / 2;
        box.getCenter(centre);
        partBox.min.set(centre.x - half, centre.y - half, centre.z - half);
        partBox.max.set(centre.x + half, centre.y + half, centre.z + half);
        return this.sees(partBox, LIVE_PX);
      })
      .map((site) => ({ ...site, away: site.box.getCenter(centre).distanceTo(eye) }))
      .sort((a, b) => a.away - b.away)
      .slice(0, this.cap);
  }

  private take(site: { readonly id: string; readonly url: string; readonly pose?: RestPose }) {
    const loop = loopOf(site.url)!;
    const life: Living = {
      url: site.url,
      pose: site.pose,
      copy: null,
      parts: new Map(),
      poses: null,
      over: false,
    };
    this.living.set(site.id, life);
    this.cook(site.url, loop.family, site.pose).then(
      (rig) => {
        // A sequence that took the site meanwhile keeps it: the next step lets it go.
        if (life.over || this.sequences.playsOn(this.host, site.id)) return;
        const copy = rig.clone(true);
        copy.traverse((node) => {
          if (!isRigPart(loop.family, node.name)) return;
          life.parts.set(node.name, {
            node,
            rest: {
              position: node.position.clone(),
              quaternion: node.quaternion.clone(),
              scale: node.scale.clone(),
            },
          });
          node.traverse((mesh) => {
            if (!(mesh as Mesh).isMesh) return;
            mesh.castShadow = false;
            mesh.userData.shadowless = true;
          });
        });
        life.poses = loop.posesOf(copy);
        life.copy = copy;
        this.pose(life);
        this.host.standIn(site.id, copy);
      },
      (error: unknown) => console.error(`boucle ${site.url}`, error),
    );
  }

  /** Its copy given back — but to a sequence that took it, which keeps it. A site gone from its
   *  host (taken, razed) has its copy withdrawn here. */
  private release(id: string, life: Living): void {
    life.over = true;
    this.living.delete(id);
    if (life.copy !== null && !this.sequences.playsOn(this.host, id)) this.host.standIn(id, null);
  }

  private pose(life: Living): void {
    if (life.poses === null) return;
    for (const [name, { turn: by, shift, stretch }] of Object.entries(life.poses(this.time))) {
      const part = life.parts.get(name);
      if (part === undefined) continue;
      const { node, rest } = part;
      node.position.copy(rest.position);
      if (shift) node.position.add(centre.set(...shift));
      node.quaternion.copy(rest.quaternion);
      if (by) node.quaternion.multiply(turn.setFromEuler(euler.set(...by)));
      node.scale.copy(rest.scale);
      if (stretch !== undefined) node.scale.y *= stretch;
    }
  }
}
