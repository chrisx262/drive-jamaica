import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const HERD_SIZE = 4;           // goats per herd
const HERD_COUNT = 6;          // herds in the country stretch
const CROSSING_TRIGGER = 25;   // m — herd starts crossing when car is this close
const HIT_RADIUS = 2.0;        // m — counts as hitting a goat
const NEAR_MISS_RADIUS = 5.0;  // m — narrator warns
const CROSSING_SPEED = 1.8;    // m/s
const CROSSING_DIST = 16;      // m — total distance each goat walks across

type HerdState = 'waiting' | 'crossing' | 'done';

interface GoatHerd {
  goats: THREE.Group[];
  crossDir: THREE.Vector3;
  state: HerdState;
  crossProgress: number;  // metres travelled across the road so far
  hitFired: boolean;
  nearFired: boolean;
}

// Goats module: herds cross the country road (Linstead→Moneague stretch).
// Hitting one: narrator scolds. Near-miss: narrator warns. API matches potholes.ts.
export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(7777);

    // Place herds in the 55–80% stretch (Linstead/Moneague country road).
    const start = Math.floor(road.points.length * 0.55);
    const end = Math.floor(road.points.length * 0.80);
    const range = end - start;
    const spacing = Math.floor(range / (HERD_COUNT + 1));

    for (let h = 0; h < HERD_COUNT; h++) {
      const pi = start + spacing * (h + 1) + Math.floor((rng() - 0.5) * spacing * 0.4);
      const idx = THREE.MathUtils.clamp(pi, 0, road.points.length - 2);

      const a = road.points[idx];
      const b = road.points[Math.min(idx + 1, road.points.length - 1)];
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const side = rng() > 0.5 ? 1 : -1;

      // Goats start on one verge, will cross to the other
      const goats: THREE.Group[] = [];
      for (let g = 0; g < HERD_SIZE; g++) {
        const goat = makeGoat();
        goat.position.copy(a)
          .addScaledVector(perp, side * (7 + rng() * 2))
          .addScaledVector(dir, (rng() - 0.5) * 4)
          .addScaledVector(perp, (rng() - 0.5) * 1.5);
        goat.position.y = 0;
        // Face in the crossing direction
        const crossDir = perp.clone().multiplyScalar(-side);
        goat.rotation.y = Math.atan2(-crossDir.x, -crossDir.z) + (rng() - 0.5) * 0.3;
        this.object.add(goat);
        goats.push(goat);
      }

      this.herds.push({
        goats,
        crossDir: perp.clone().multiplyScalar(-side),
        state: 'waiting',
        crossProgress: 0,
        hitFired: false,
        nearFired: false,
      });
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.state === 'done') continue;

      const leadPos = herd.goats[0].position;
      const dist = leadPos.distanceTo(carPos);

      if (herd.state === 'waiting' && dist < CROSSING_TRIGGER) {
        herd.state = 'crossing';
      }

      if (herd.state === 'crossing') {
        const step = CROSSING_SPEED * dt;
        herd.crossProgress += step;

        for (const g of herd.goats) {
          g.position.addScaledVector(herd.crossDir, step);

          if (!herd.hitFired && g.position.distanceTo(carPos) < HIT_RADIUS) {
            herd.hitFired = true;
            narrate('goat.hit');
          }
        }

        if (!herd.nearFired && dist < NEAR_MISS_RADIUS && dist > HIT_RADIUS) {
          herd.nearFired = true;
          narrate('goat.near');
        }

        if (herd.crossProgress >= CROSSING_DIST) {
          herd.state = 'done';
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
