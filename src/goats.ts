import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

export const GOAT_HIT_RADIUS = 1.8; // exported for debug overlay

const CROSS_SPEED = 1.8;     // m/s — unhurried goat pace
const ROAD_HALF_WIDTH = 4.5; // approximate half-width of the road ribbon
const ACTIVATION_DIST = 50;  // m — herd starts crossing when car is this close
const HERDS_PER_SEGMENT = 3;
const MIN_HERD = 3;
const MAX_HERD = 6;

// Goats appear on the country roads between Linstead and Moneague.
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface GoatInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  start: THREE.Vector3;
  end: THREE.Vector3;
  t: number;       // 0 → 1 crossing progress
  moving: boolean;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatInstance[][] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4242);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;
      const span = seg.to - seg.from;

      for (let h = 0; h < HERDS_PER_SEGMENT; h++) {
        const t = (h + 0.15 + rng() * 0.7) / HERDS_PER_SEGMENT;
        const ptIdx = seg.from + Math.floor(t * span);
        if (ptIdx >= road.points.length - 1) continue;

        const pt = road.points[ptIdx];
        const next = road.points[Math.min(ptIdx + 1, road.points.length - 1)];
        const fwd = next.clone().sub(pt).normalize();
        const perp = new THREE.Vector3(fwd.z, 0, -fwd.x); // left of direction

        const herdSize = MIN_HERD + Math.floor(rng() * (MAX_HERD - MIN_HERD + 1));
        const herd: GoatInstance[] = [];

        for (let g = 0; g < herdSize; g++) {
          const along = (g - herdSize / 2) * 1.2 + (rng() - 0.5) * 0.6;
          const offStart = ROAD_HALF_WIDTH + 2.5 + rng() * 2.5;
          const offEnd   = ROAD_HALF_WIDTH + 2.5 + rng() * 2.5;

          const start = pt.clone()
            .addScaledVector(fwd, along)
            .addScaledVector(perp, offStart);
          const end = pt.clone()
            .addScaledVector(fwd, along)
            .addScaledVector(perp, -offEnd);
          start.y = 0;
          end.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(start);
          mesh.scale.setScalar(0.85 + rng() * 0.3);
          this.object.add(mesh);

          herd.push({ mesh, pos: start.clone(), start: start.clone(), end: end.clone(), t: 0, moving: false, hit: false });
        }
        this.herds.push(herd);
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      const lead = herd[0];

      // Activate herd when car approaches
      if (!lead.moving && lead.t === 0) {
        const dist = lead.pos.distanceTo(car.position);
        if (dist < ACTIVATION_DIST) {
          for (const g of herd) g.moving = true;
        }
      }

      for (const goat of herd) {
        if (!goat.moving || goat.t >= 1) continue;

        const crossDist = goat.start.distanceTo(goat.end);
        goat.t = Math.min(1, goat.t + (CROSS_SPEED / (crossDist || 1)) * dt);
        goat.pos.lerpVectors(goat.start, goat.end, goat.t);
        goat.mesh.position.copy(goat.pos);

        const dir = goat.end.clone().sub(goat.start).setY(0);
        if (dir.lengthSq() > 0.001) {
          dir.normalize();
          goat.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
        }

        // Hit detection — tyre burst + narrator (once per goat)
        if (!goat.hit && goat.pos.distanceTo(car.position) < GOAT_HIT_RADIUS) {
          goat.hit = true;
          car.burstTyre();
          narrate('goat.hit');
        }
      }
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
