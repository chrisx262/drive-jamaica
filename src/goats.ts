import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herds cross country roads unattended (Linstead→Moneague stretch).
// When the car approaches a herd, it starts ambling across. Hitting a goat
// bursts the tyre (8-second penalty) and triggers a narrator scolding.

const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 6;
const TRIGGER_RANGE = 60;    // metres — herd begins crossing
const HIT_RADIUS = 2.2;      // metres — car registers a hit
const CROSS_SPEED = 2.4;     // m/s — casual goat pace
const ROAD_HALF_SPAN = 10;   // metres — start this far off road, end same distance other side
const HERD_SPACING_MIN = 400;
const HERD_SPACING_MAX = 1100;
const REPAIR_DELAY_MS = 8000;

// Country segments where goat herds appear.
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Ocho Rios Road',
  'Bog Walk Gorge',
  'Bogwalk Gorge Road',
  'River Road',
]);

interface GoatHerd {
  goats: THREE.Object3D[];
  triggerPos: THREE.Vector3;  // road-centre point that triggers the crossing
  crossDir: THREE.Vector3;    // normalized direction of travel across road
  crossSeconds: number;       // total time to fully cross (computed from width+speed)
  elapsed: number;            // seconds since herd triggered
  triggered: boolean;
  done: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];
  private hitCooldownMs = 0;
  private repairTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4321);

    let nextAt = HERD_SPACING_MIN + rng() * HERD_SPACING_MAX;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i - 1 >= s.from && i - 1 < s.to);

      while (travelled + segLen >= nextAt) {
        if (seg && GOAT_SEGMENTS.has(seg.name)) {
          const t = (nextAt - travelled) / segLen;
          const spawnCentre = a.clone().lerp(b, t);
          const dir = b.clone().sub(a).normalize();

          // Cross direction: perpendicular to road; randomly left or right
          const side = rng() > 0.5 ? 1 : -1;
          const crossDir = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);

          // Start goats on the approach-side verge
          const startOffset = crossDir.clone().negate().multiplyScalar(ROAD_HALF_SPAN);

          const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const goatMeshes: THREE.Object3D[] = [];

          for (let g = 0; g < herdSize; g++) {
            const goat = makeGoat();
            // Stagger goats loosely around spawn centre
            const jitter = new THREE.Vector3(
              (rng() - 0.5) * 5,
              0,
              (rng() - 0.5) * 5,
            );
            goat.position.copy(spawnCentre).add(startOffset).add(jitter);
            // Face across the road
            goat.rotation.y = Math.atan2(crossDir.x, crossDir.z);
            this.object.add(goat);
            goatMeshes.push(goat);
          }

          const crossSeconds = (ROAD_HALF_SPAN * 2) / CROSS_SPEED;

          this.herds.push({
            goats: goatMeshes,
            triggerPos: spawnCentre.clone(),
            crossDir: crossDir.clone(),
            crossSeconds,
            elapsed: 0,
            triggered: false,
            done: false,
          });
        }
        nextAt += HERD_SPACING_MIN + rng() * (HERD_SPACING_MAX - HERD_SPACING_MIN);
      }
      travelled += segLen;
    }
  }

  update(dt: number, car: Car): void {
    this.hitCooldownMs = Math.max(0, this.hitCooldownMs - dt * 1000);
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.done) continue;

      if (!herd.triggered && herd.triggerPos.distanceTo(carPos) < TRIGGER_RANGE) {
        herd.triggered = true;
      }

      if (herd.triggered) {
        herd.elapsed += dt;
        for (const goat of herd.goats) {
          goat.position.addScaledVector(herd.crossDir, CROSS_SPEED * dt);

          // Hit check: goat vs car
          if (this.hitCooldownMs <= 0 && goat.position.distanceTo(carPos) < HIT_RADIUS) {
            if (!car.tyreBurst) {
              car.burstTyre();
              narrate('goat.hit');
              this.hitCooldownMs = 6000;
              clearTimeout(this.repairTimer);
              this.repairTimer = setTimeout(() => car.repairTyre(), REPAIR_DELAY_MS);
            }
          }
        }
        if (herd.elapsed >= herd.crossSeconds) {
          herd.done = true;
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
