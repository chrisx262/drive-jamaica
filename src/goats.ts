import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const APPROACH_RANGE = 28; // world units — triggers the herd to start crossing
const HIT_RADIUS = 2.2;    // world units — car-to-goat collision distance
const CROSS_SPEED = 1.8;   // m/s — goats amble, they don't rush
const TOTAL_CROSS = 18;    // world units — full crossing distance (road + verges)
const MIN_GAP = 220;       // world units between herds

// Goats roam the country roads between Linstead and Moneague.
const GOAT_SEGMENTS = ['Linstead - Moneague Road', 'Pleasant Farm Road', 'McGrath Road'];

interface GoatHerd {
  goats: Array<{ mesh: THREE.Object3D; offset: THREE.Vector3 }>;
  origin: THREE.Vector3;    // start-side center when idle
  crossDir: THREE.Vector3;  // normalized direction of travel across road
  crossProgress: number;    // 0 (not started) → 1 (fully across)
  state: 'idle' | 'crossing' | 'done';
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const goatPts = new Set<number>();
    for (const seg of road.segments) {
      if (GOAT_SEGMENTS.some((n) => seg.name.includes(n))) {
        for (let i = seg.from; i < seg.to; i++) goatPts.add(i);
      }
    }

    let travelled = 0;
    let nextAt = MIN_GAP * (0.4 + rng() * 0.6);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      if (!goatPts.has(i)) {
        travelled += segLen;
        continue;
      }

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(dir.z, 0, -dir.x); // perpendicular to road
        const roadCenter = a.clone().lerp(b, t);
        roadCenter.y = 0;

        const startSide = rng() > 0.5 ? 1 : -1;
        // Goats start just off the road verge on one side
        const origin = roadCenter.clone().addScaledVector(perp, startSide * 7);
        const crossDir = perp.clone().multiplyScalar(-startSide); // crossing direction
        const goatCount = 2 + Math.floor(rng() * 3); // 2–4 goats

        const herd: GoatHerd = {
          goats: [],
          origin,
          crossDir,
          crossProgress: 0,
          state: 'idle',
          hit: false,
        };

        for (let g = 0; g < goatCount; g++) {
          const mesh = makeGoat();
          const offset = new THREE.Vector3(
            (rng() - 0.5) * 2.6,
            0,
            (rng() - 0.5) * 2.6,
          );
          mesh.position.copy(origin).add(offset);
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);
          herd.goats.push({ mesh, offset });
        }

        this.herds.push(herd);
        nextAt += MIN_GAP + rng() * MIN_GAP;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.state === 'done') continue;

      if (herd.state === 'idle') {
        if (herd.origin.distanceTo(car.position) < APPROACH_RANGE) {
          herd.state = 'crossing';
        }
        continue;
      }

      herd.crossProgress = Math.min(herd.crossProgress + (CROSS_SPEED * dt) / TOTAL_CROSS, 1);

      for (const { mesh, offset } of herd.goats) {
        mesh.position
          .copy(herd.origin)
          .addScaledVector(herd.crossDir, herd.crossProgress * TOTAL_CROSS)
          .add(offset);

        if (!herd.hit && mesh.position.distanceTo(car.position) < HIT_RADIUS) {
          herd.hit = true;
          narrate('goat.hit');
        }
      }

      if (herd.crossProgress >= 1) herd.state = 'done';
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
