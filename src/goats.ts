import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';
import { makeGoat } from './animals';

// Goat herds cross country roads unattended on the Linstead–Moneague stretch.
// Hitting one at speed: brief speed penalty + narrator scolding.
// Module pattern mirrors potholes.ts — public API is constructor + update(car, dt).

export const HIT_RADIUS = 1.8; // exported for debug overlay

const GOAT_SEG_NAMES = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
]);

const HERD_SPACING = 380;      // metres between herds (compressed-world scale)
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 5;
const CROSS_HALF = 11;         // metres: goats travel from -CROSS_HALF to +CROSS_HALF
const CROSS_SPEED = 0.85;      // m/s — slow amble
const PENALTY_DURATION = 3200; // ms
const PENALTY_SPEED_CAP = 9;   // m/s (~32 km/h) for penalty window

interface GoatInstance {
  mesh: THREE.Group;
  roadPt: THREE.Vector3;
  perpDir: THREE.Vector3; // unit vec perpendicular to road (left = positive)
  crossT: number;         // signed lateral displacement from road centre (metres)
  crossDir: 1 | -1;      // which way currently crossing
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private instances: GoatInstance[] = [];
  private hitNarratedOnce = false;
  private penaltyUntil = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2029);

    // Mark which point indices lie inside goat zones.
    const inZone = new Uint8Array(road.points.length);
    for (const seg of road.segments) {
      if (GOAT_SEG_NAMES.has(seg.name)) {
        for (let k = seg.from; k < seg.to; k++) inZone[k] = 1;
      }
    }

    let nextAt = -1; // metres along route; -1 = "not yet initialised"
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      if (inZone[i - 1]) {
        if (nextAt < 0) {
          // First entry into a goat zone: schedule first herd soon
          nextAt = travelled + HERD_SPACING * 0.25 + rng() * HERD_SPACING * 0.25;
        }

        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const roadPt = a.clone().lerp(b, t);
          roadPt.y = 0;

          const dir = b.clone().sub(a).normalize();
          const perpDir = new THREE.Vector3(dir.z, 0, -dir.x); // left-of-travel

          const n = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const startSide = rng() > 0.5 ? 1 : -1;

          for (let j = 0; j < n; j++) {
            // Stagger each goat within the herd slightly
            const lateralJitter = (rng() - 0.5) * 3.5;
            const initT = startSide * (CROSS_HALF - 0.5 + rng() * 1.5) + lateralJitter;

            const mesh = makeGoat();
            mesh.position.copy(roadPt).addScaledVector(perpDir, initT);
            mesh.position.y = 0;
            // Face the crossing direction
            const crossDirVec = perpDir.clone().multiplyScalar(startSide);
            mesh.rotation.y = Math.atan2(crossDirVec.x, crossDirVec.z);
            this.object.add(mesh);

            this.instances.push({
              mesh,
              roadPt: roadPt.clone(),
              perpDir: perpDir.clone(),
              crossT: initT,
              crossDir: (-startSide) as 1 | -1, // start crossing toward the other side
              hit: false,
            });
          }

          nextAt += HERD_SPACING + rng() * HERD_SPACING * 0.5;
        }
      }

      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();

    // Speed cap during penalty window
    if (now < this.penaltyUntil && car.speed > PENALTY_SPEED_CAP) {
      car.speed = PENALTY_SPEED_CAP;
    }

    for (const g of this.instances) {
      if (g.hit) continue;

      // Advance the goat across the road
      g.crossT += g.crossDir * CROSS_SPEED * dt;

      // Bounce when reaching the far side — goats wander back and forth
      if (Math.abs(g.crossT) > CROSS_HALF + 2) {
        g.crossDir = (-g.crossDir) as 1 | -1;
      }

      // Update world position and facing
      g.mesh.position.copy(g.roadPt).addScaledVector(g.perpDir, g.crossT);
      g.mesh.position.y = 0;
      const travelVec = g.perpDir.clone().multiplyScalar(g.crossDir);
      g.mesh.rotation.y = Math.atan2(travelVec.x, travelVec.z);

      // Hit detection
      if (g.mesh.position.distanceToSquared(car.position) < HIT_RADIUS * HIT_RADIUS) {
        g.hit = true;
        this.object.remove(g.mesh);
        // Apply immediate speed knock and start penalty window
        if (car.speed > PENALTY_SPEED_CAP) car.speed = PENALTY_SPEED_CAP;
        this.penaltyUntil = now + PENALTY_DURATION;
        if (!this.hitNarratedOnce) {
          this.hitNarratedOnce = true;
          narrate('goat.hit');
        }
      }
    }
  }
}

// Same PRNG used by potholes.ts and dogs.ts — deterministic scatter.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
