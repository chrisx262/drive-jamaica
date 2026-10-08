import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

export const GOAT_HIT_RADIUS = 2.2; // exported for debug overlay

const HERD_SPEED = 1.8;      // m/s — goats amble across the road
const HERD_SPREAD = 3.0;     // random scatter within the herd
const CROSS_HALF_WIDTH = 20; // goats start this far off-road then cross to opposite side
const TRIGGER_DIST = 100;    // meters — herd starts moving when car gets this close
const HERD_SPACING = 300;    // minimum world-meters between herds
const HERD_SIZE = 5;         // goats per herd

// Country-road stretch where goats appear: Linstead → Moneague Road
const GOAT_STRETCH: [number, number] = [391, 628];

export class Goats {
  readonly object: THREE.Group;
  private herds: {
    goats: THREE.Object3D[];
    crossPoint: THREE.Vector3;
    crossDir: THREE.Vector3;
    phase: 'waiting' | 'crossing' | 'done';
    progress: number; // 0 → 1 fraction across the full crossing width
  }[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);
    const [from, to] = GOAT_STRETCH;

    let nextAt = HERD_SPACING * 0.35;
    let travelled = 0;

    for (let i = from + 1; i < Math.min(to, road.points.length); i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(dir.z, 0, -dir.x);
        const crossPoint = a.clone().lerp(b, t);

        // Goats start on one roadside and cross to the other
        const startSide = rng() > 0.5 ? 1 : -1;
        const crossDir = perp.clone().multiplyScalar(-startSide);

        const goats: THREE.Object3D[] = [];
        for (let g = 0; g < HERD_SIZE; g++) {
          const goat = makeGoat();
          const scatter = new THREE.Vector3(
            (rng() - 0.5) * HERD_SPREAD,
            0,
            (rng() - 0.5) * HERD_SPREAD
          );
          // Initial position: off-road on the start side
          goat.position.copy(crossPoint)
            .addScaledVector(perp, startSide * CROSS_HALF_WIDTH)
            .add(scatter);
          goat.rotation.y = Math.atan2(-crossDir.x, -crossDir.z) + (rng() - 0.5) * 0.4;
          this.object.add(goat);
          goats.push(goat);
        }

        this.herds.push({ goats, crossPoint, crossDir, phase: 'waiting', progress: 0 });
        nextAt += HERD_SPACING + rng() * HERD_SPACING * 0.5;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.phase === 'done') continue;

      if (herd.phase === 'waiting' && herd.crossPoint.distanceTo(car.position) < TRIGGER_DIST) {
        herd.phase = 'crossing';
      }

      if (herd.phase === 'crossing') {
        const step = HERD_SPEED * dt;
        herd.progress += step / (CROSS_HALF_WIDTH * 2);

        for (const goat of herd.goats) {
          goat.position.addScaledVector(herd.crossDir, step);
          goat.rotation.y = Math.atan2(-herd.crossDir.x, -herd.crossDir.z);

          if (goat.position.distanceTo(car.position) < GOAT_HIT_RADIUS) {
            narrate('goat.hit');
            herd.phase = 'done';
            break;
          }
        }

        if (herd.progress >= 1) herd.phase = 'done';
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
