import * as THREE from 'three';
import { makeGoat } from './animals';
import { narrate } from './narrator';
import type { Car } from './car';

// Goat herds cross country roads unattended (Linstead–Moneague stretch).
// Hitting a goat: 50-point score penalty + narrator scolding.
// Near-miss (within 4m but outside hit radius): lighter narrator comment.
//
// Public API matches the pattern of src/potholes.ts.

const HIT_RADIUS       = 1.4;   // metres — collision
const NEAR_MISS_RADIUS = 4.0;   // metres — near-miss (outside hit radius)
const HERD_SIZE        = 4;     // goats per herd
const CROSS_SPEED      = 1.8;   // m/s — relaxed crossing pace
const CROSS_DISTANCE   = 24;    // metres — distance until goat is done crossing
const SCORE_PENALTY    = 50;

// Country-road stretches where goats appear (Linstead–Moneague leg).
// Point index ranges from route.json segments:
//   Linstead - Moneague Road: 391–403 and 458–628
//   Pleasant Farm Road:       403–446
const COUNTRY_RANGES: [number, number][] = [
  [391, 446],
  [458, 628],
];
const HERDS_PER_STRETCH = 3;

interface GoatHerd {
  goats: GoatUnit[];
  active: boolean;
  triggered: boolean;
  triggerDist: number;
  crossDir: THREE.Vector3;
}

interface GoatUnit {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  startDelay: number;
  distCrossed: number;
  hit: boolean;
  nearMissed: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];
  score = 0;

  constructor(points: THREE.Vector3[]) {
    this.object = new THREE.Group();
    const rng = mulberry32(8787);

    for (const [from, to] of COUNTRY_RANGES) {
      for (let k = 0; k < HERDS_PER_STRETCH; k++) {
        const t = rng();
        const idx = from + Math.floor(t * (to - from - 1));
        if (idx >= points.length - 1) continue;

        const a = points[idx];
        const b = points[idx + 1];
        const fwd = b.clone().sub(a).normalize();
        const crossDir = new THREE.Vector3(-fwd.z, 0, fwd.x);
        if (rng() < 0.5) crossDir.negate();

        const startSide = crossDir.clone().negate().multiplyScalar(10 + rng() * 4);
        const roadPoint = a.clone().lerp(b, 0.3 + rng() * 0.4);

        const goats: GoatUnit[] = [];
        for (let g = 0; g < HERD_SIZE; g++) {
          const jitter = new THREE.Vector3((rng() - 0.5) * 3, 0, (rng() - 0.5) * 3);
          const pos = roadPoint.clone().add(startSide).add(jitter);
          pos.y = 0;
          const mesh = makeGoat();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
          this.object.add(mesh);
          goats.push({ mesh, pos, startDelay: g * 0.6 + rng() * 0.4, distCrossed: 0, hit: false, nearMissed: false });
        }

        this.herds.push({
          goats,
          active: false,
          triggered: false,
          triggerDist: 28 + rng() * 10,
          crossDir: crossDir.clone(),
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.triggered && !herd.active) continue;

      if (!herd.triggered) {
        if (herd.goats[0].pos.distanceTo(carPos) < herd.triggerDist) {
          herd.triggered = true;
          herd.active = true;
        } else {
          continue;
        }
      }

      let allDone = true;
      for (const goat of herd.goats) {
        if (goat.hit || goat.distCrossed >= CROSS_DISTANCE) continue;

        if (goat.startDelay > 0) {
          goat.startDelay = Math.max(0, goat.startDelay - dt);
          allDone = false;
          continue;
        }

        const step = CROSS_SPEED * dt;
        goat.distCrossed += step;
        goat.pos.addScaledVector(herd.crossDir, step);
        goat.mesh.position.copy(goat.pos);

        const dist = goat.pos.distanceTo(carPos);

        if (dist < HIT_RADIUS) {
          goat.hit = true;
          this.score -= SCORE_PENALTY;
          narrate('goat.hit');
          goat.mesh.visible = false;
          continue;
        }

        if (!goat.nearMissed && dist < NEAR_MISS_RADIUS) {
          goat.nearMissed = true;
          narrate('goat.near_miss');
        }

        if (goat.distCrossed < CROSS_DISTANCE) allDone = false;
      }

      if (allDone) herd.active = false;
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
