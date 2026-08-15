import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { regionType, type DisplayedRegion, type RegionsData } from '@/domain/world';
import type { RegionType } from '@/domain/ids';
import type { Curvature } from './curvature';
import { PALETTE } from './palette';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { createProp, disposeTerrain, TYPE_TINTS } from './terrain';

export const REGIONS_FULL_DISTANCE = 30;
export const REGIONS_GONE_DISTANCE = 65;
/**
 * Well under the country borders' opacity (0.62 at rest, reinforced at zoom): WebGL draws
 * everything one pixel wide, so the hierarchy between country and region goes through the
 * ink, not the thickness.
 */
const FULL_OPACITY = 0.3;

/** Stacking flush with the slab: highlight under the strokes, strokes under the borders. */
const STROKE_LIFT = 0.003;
const HIGHLIGHT_LIFT = 0.001;
const PROP_LIFT = 0.001;

type PreparedRegion = {
  readonly region: DisplayedRegion;
  readonly box: readonly [minX: number, minY: number, maxX: number, maxY: number];
  readonly area: number;
};

/**
 * The admin-1 borders (regions, states, departments) of `regions.json` — inner segments
 * only, coasts and country borders being drawn already. The layer only exists up close: far
 * out it fades before becoming noise. Once visible, it answers hover — point in region,
 * smallest first (an enclave beats its envelope).
 */
export class RegionLayer {
  readonly lines: LineSegments;
  readonly highlight: Mesh;
  readonly props = new Group();
  private readonly lineMaterial: LineBasicMaterial;
  private readonly highlightMaterial: MeshBasicMaterial;
  private prepared: PreparedRegion[] = [];
  private hoveredRegion: DisplayedRegion | null = null;
  private birth = 0;
  private share = 0;

  constructor(
    private readonly frame: WorldFrame,
    private readonly curvature: Curvature,
  ) {
    this.lineMaterial = new LineBasicMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: 0,
    });
    this.lines = new LineSegments(new BufferGeometry(), this.lineMaterial);
    this.lines.visible = false;

    this.highlightMaterial = new MeshBasicMaterial({
      color: PALETTE.paper,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.highlight = new Mesh(new BufferGeometry(), this.highlightMaterial);
    this.highlight.visible = false;
  }

  display(data: RegionsData): void {
    const points: number[] = [];
    for (const line of data.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i]!;
        const [bx, by] = line[i + 1]!;
        points.push(
          ax - this.frame.centerX, COUNTRY_THICKNESS + STROKE_LIFT, ay - this.frame.centerY,
          bx - this.frame.centerX, COUNTRY_THICKNESS + STROKE_LIFT, by - this.frame.centerY,
        );
      }
    }
    this.lines.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    this.lines.geometry = this.curvature.register(geometry);

    this.prepared = data.regions.map((region) => {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let area = 0;
      for (const ring of region.rings) {
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = ring[i]!;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          const [nextX, nextY] = ring[(i + 1) % ring.length]!;
          area += x * nextY - nextX * y;
        }
      }
      return { region, box: [minX, minY, maxX, maxY], area: Math.abs(area / 2) };
    });
  }

  get isActive(): boolean {
    return this.share > 0.01 && this.prepared.length > 0;
  }

  /** The point is in projected coordinates (those of `world.json`), not world coordinates. */
  hover(projectedX: number, projectedY: number): string | null {
    let kept: PreparedRegion | null = null;
    for (const candidate of this.prepared) {
      const [minX, minY, maxX, maxY] = candidate.box;
      if (projectedX < minX || projectedX > maxX || projectedY < minY || projectedY > maxY) continue;
      if (kept !== null && candidate.area >= kept.area) continue;
      if (contains(candidate.region, projectedX, projectedY)) kept = candidate;
    }
    this.changeHighlight(kept);
    return kept?.region.name ?? null;
  }

  clearHover(): void {
    this.changeHighlight(null);
  }

  /** Fade driven by camera→target distance; invisible, the layer costs nothing. */
  animate(cameraDistance: number): void {
    this.share = Math.min(
      1,
      Math.max(
        0,
        (REGIONS_GONE_DISTANCE - cameraDistance) /
        (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
      ),
    );
    this.lineMaterial.opacity = this.share * FULL_OPACITY;
    this.lines.visible = this.share > 0.01;
    if (!this.isActive) this.changeHighlight(null);
    else this.highlight.visible = this.hoveredRegion !== null;
    this.growProps();
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.highlight.geometry.dispose();
    this.lineMaterial.dispose();
    this.highlightMaterial.dispose();
    // The props share the terrain module's geometries and materials: `disposeTerrain` frees
    // them once, and detaching here keeps the engine's final sweep from meeting them again.
    this.props.clear();
    this.lines.removeFromParent();
    this.highlight.removeFromParent();
    this.props.removeFromParent();
    disposeTerrain();
  }

  private changeHighlight(prepared: PreparedRegion | null): void {
    const region = prepared?.region ?? null;
    if (region === this.hoveredRegion) return;
    this.hoveredRegion = region;
    this.highlight.geometry.dispose();
    this.props.clear();
    if (prepared === null || region === null) {
      this.highlight.geometry = new BufferGeometry();
      this.highlight.visible = false;
      return;
    }

    const type = regionType(region.name);
    this.highlightMaterial.color.set(TYPE_TINTS[type]);
    this.sowProps(prepared, type);

    const geometries = region.rings.map((ring) => {
      const shape = new Shape();
      ring.forEach(([x, y], index) => {
        const px = x - this.frame.centerX;
        const py = -(y - this.frame.centerY);
        if (index === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
      });
      return new ShapeGeometry(shape);
    });
    const geometry = geometries.length > 1 ? mergeGeometries(geometries, false)! : geometries[0]!;
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position!;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(
        i,
        COUNTRY_THICKNESS + HIGHLIGHT_LIFT + this.frame.drop(positions.getX(i), positions.getZ(i)),
      );
    }
    positions.needsUpdate = true;

    this.highlight.geometry = geometry;
    this.highlight.visible = true;
  }

  /**
   * Sows the type's 3D props — interior points by rejection in the box, seed drawn from the
   * name so the same clearing shows on every hover. Size and count follow the area: an Oise
   * reads up close, an Amazon from afar.
   */
  private sowProps(prepared: PreparedRegion, type: RegionType): void {
    const [minX, minY, maxX, maxY] = prepared.box;
    const random = mulberry(seed(prepared.region.name));
    const count = Math.min(24, Math.max(8, Math.round(Math.sqrt(prepared.area) * 8)));
    const size = Math.min(0.9, Math.max(0.28, 0.18 + Math.sqrt(prepared.area) * 0.06));
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 80) {
      attempts++;
      const x = minX + random() * (maxX - minX);
      const y = minY + random() * (maxY - minY);
      if (!contains(prepared.region, x, y)) continue;
      const prop = createProp(type);
      prop.position.copy(this.frame.toWorld(x, y, COUNTRY_THICKNESS + PROP_LIFT));
      prop.rotation.y = random() * Math.PI * 2;
      prop.scale.setScalar(0.0001);
      prop.userData.size = size * (0.7 + random() * 0.6);
      prop.userData.delay = placed * 35 + random() * 50;
      this.props.add(prop);
      placed++;
    }
    this.birth = performance.now();
  }

  /** The growth: scale 0 → size with a slight overshoot, staggered prop by prop. */
  private growProps(): void {
    if (this.props.children.length === 0) return;
    const age = performance.now() - this.birth;
    for (const child of this.props.children) {
      const t = Math.min(1, Math.max(0, (age - (child.userData.delay as number)) / 320));
      const overshoot = 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
      child.scale.setScalar(Math.max(0.0001, (child.userData.size as number) * overshoot));
    }
  }
}

function seed(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

function mulberry(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function contains(region: DisplayedRegion, x: number, y: number): boolean {
  let inside = false;
  for (const ring of region.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}
