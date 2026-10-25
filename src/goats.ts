import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

export const GOAT_HIT_RADIUS = 2.2; // exported for debug overlay

const CROSS_SPEED = 1.8;    // m/s — goats cross slowly
const ACTIVATE_DIST = 50;   // m — herd starts moving when car is this close
const HERD_MIN_GAP = 480;   // compressed-world metres between herds

// Goats cross country roads unattended on the Linstead–Moneague stretch (GAME_SPEC).
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface GoatState {
  mesh: THREE.Group;
  hit: boolean;
  done: boolean;
}

interface Herd {
  goats: GoatState[];
  center: THREE.Vector3;
  crossDir: THREE.Vector3;
  active: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    let distInSeg = 0;
    let nextHerdAt = HERD_MIN_GAP * (0.3 + rng() * 0.5);
    let lastSegName = '';

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i > s.from && i <= s.to);
      if (!seg || !GOAT_SEGMENTS.has(seg.name)) {
        if (lastSegName !== (seg?.name ?? '')) {
          distInSeg = 0;
          nextHerdAt = HERD_MIN_GAP * (0.3 + rng() * 0.5);
          lastSegName = seg?.name ?? '';
        }
        continue;
      }
      if (lastSegName !== seg.name) {
        distInSeg = 0;
        nextHerdAt = HERD_MIN_GAP * (0.3 + rng() * 0.5);
        lastSegName = seg.name;
      }

      distInSeg += road.points[i - 1].distanceTo(road.points[i]);
      if (distInSeg < nextHerdAt) continue;
      nextHerdAt += HERD_MIN_GAP * (0.6 + rng() * 0.8);

      const center = road.points[i].clone();
      const nextPt = road.points[Math.min(i + 1, road.points.length - 1)];
      const dir = nextPt.clone().sub(center).normalize();
      // Perpendicular — direction of crossing
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const startSide = rng() > 0.5 ? 1 : -1;
      const startOffset = perp.clone().multiplyScalar(startSide * (10 + rng() * 8));
      const crossDir = perp.clone().multiplyScalar(-startSide); // goats cross toward other side

      const size = 3 + Math.floor(rng() * 4); // 3–6 goats per herd
      const herdGoats: GoatState[] = [];

      for (let g = 0; g < size; g++) {
        const along = (g - (size - 1) / 2) * 2.8;
        const pos = center.clone().add(startOffset).addScaledVector(dir, along);
        pos.y = 0;
        const mesh = makeGoat();
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
        this.object.add(mesh);
        herdGoats.push({ mesh, hit: false, done: false });
      }

      this.herds.push({ goats: herdGoats, center, crossDir, active: false });
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (!herd.active && herd.center.distanceTo(car.position) < ACTIVATE_DIST) {
        herd.active = true;
      }
      if (!herd.active) continue;

      for (const goat of herd.goats) {
        if (goat.done) continue;
        goat.mesh.position.addScaledVector(herd.crossDir, CROSS_SPEED * dt);

        if (!goat.hit && goat.mesh.position.distanceTo(car.position) < GOAT_HIT_RADIUS) {
          goat.hit = true;
          goat.done = true;
          narrate('goat.hit');
        } else if (goat.mesh.position.distanceTo(herd.center) > 32) {
          goat.done = true;
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
