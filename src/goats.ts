import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const HERD_SIZE = 4;
const TRIGGER_DIST = 70;   // car distance that starts the crossing (m)
const CROSS_SPEED = 2.5;   // m/s goat walking speed
const HIT_RADIUS = 2.5;    // hit a goat within this distance (m)
const START_SIDE = -16;    // herds spawn 16 m left of road centre
const END_SIDE = 20;       // herd is done when it has crossed 20 m past centre

// Country-road segments where goats roam unattended (Linstead–Moneague stretch).
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface GoatEntry {
  mesh: THREE.Object3D;
  baseAlong: number;    // offset along the road direction (stagger within herd)
  baseLateral: number;  // per-goat variation around the herd's lateral position
}

interface Herd {
  entries: GoatEntry[];
  anchor: THREE.Vector3;
  dir: THREE.Vector3;
  perp: THREE.Vector3;
  lateralOffset: number;
  crossing: boolean;
  done: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  private hitNarrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2029);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;
      const len = seg.to - seg.from;
      const count = 2 + Math.floor(rng() * 2); // 2–3 herds per segment

      for (let h = 0; h < count; h++) {
        const idx = seg.from + Math.floor(len / (count + 1)) * (h + 1);
        if (idx + 1 >= road.points.length) continue;

        const a = road.points[idx];
        const b = road.points[Math.min(idx + 1, road.points.length - 1)];
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        const entries: GoatEntry[] = [];
        for (let g = 0; g < HERD_SIZE; g++) {
          const mesh = makeGoat();
          const baseAlong = (g - HERD_SIZE / 2 + 0.5) * 2.5 + (rng() - 0.5);
          const baseLateral = (rng() - 0.5) * 2;

          const initPos = a.clone()
            .addScaledVector(dir, baseAlong)
            .addScaledVector(perp, START_SIDE + baseLateral);
          initPos.y = 0;
          mesh.position.copy(initPos);
          this.object.add(mesh);

          entries.push({ mesh, baseAlong, baseLateral });
        }

        this.herds.push({
          entries,
          anchor: a.clone(),
          dir,
          perp,
          lateralOffset: START_SIDE,
          crossing: false,
          done: false,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.done) continue;

      if (!herd.crossing && herd.anchor.distanceTo(car.position) < TRIGGER_DIST) {
        herd.crossing = true;
      }

      if (!herd.crossing) continue;

      herd.lateralOffset += CROSS_SPEED * dt;
      if (herd.lateralOffset > END_SIDE) {
        herd.done = true;
        continue;
      }

      for (const ge of herd.entries) {
        const pos = herd.anchor.clone()
          .addScaledVector(herd.dir, ge.baseAlong)
          .addScaledVector(herd.perp, herd.lateralOffset + ge.baseLateral);
        pos.y = 0;
        ge.mesh.position.copy(pos);
        ge.mesh.rotation.y = Math.atan2(-herd.perp.x, -herd.perp.z);

        if (!this.hitNarrated && car.position.distanceTo(pos) < HIT_RADIUS) {
          narrate('goat.hit');
          this.hitNarrated = true;
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
