import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goats cross unattended on country roads between Linstead and Moneague.
// A herd is positioned across or near the road; when the car hits one the
// score takes a penalty and the narrator scolds.
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
]);

const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const HERDS_PER_SEGMENT_KM = 0.6; // one herd roughly every 1.7 km on country roads
const HIT_RADIUS = 1.6;           // metres — car hits a goat
const WANDER_SPEED = 0.6;         // m/s — slow amble across road
const SCATTER_SPEED = 3.8;        // m/s — panicked bolt after being hit nearby

export interface GoatHitEvent {
  penalty: number; // score penalty (exported for scoring module)
}

export class Goats {
  readonly object: THREE.Group;

  private goats: {
    mesh: THREE.Group;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    hit: boolean;    // has this individual goat been struck?
    scattered: boolean;
  }[] = [];

  // Expose accumulated penalty for the scoring module
  penalty = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4451);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;

      const pts = road.points.slice(seg.from, seg.to + 1);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += pts[i - 1].distanceTo(pts[i]);

      const herdCount = Math.max(1, Math.round(len * HERDS_PER_SEGMENT_KM / 1000));
      for (let h = 0; h < herdCount; h++) {
        const t = 0.05 + rng() * 0.9; // keep away from segment ends
        let walked = 0;
        const target = t * len;
        let herdOrigin = pts[0].clone();
        let segDir = new THREE.Vector3(0, 0, 1);
        for (let i = 1; i < pts.length; i++) {
          const d = pts[i - 1].distanceTo(pts[i]);
          if (walked + d >= target) {
            const frac = (target - walked) / d;
            herdOrigin = pts[i - 1].clone().lerp(pts[i], frac);
            segDir = pts[i].clone().sub(pts[i - 1]).normalize();
            break;
          }
          walked += d;
        }

        // Herds cross laterally — velocity is perpendicular to road
        const crossDir = new THREE.Vector3(-segDir.z, 0, segDir.x);
        // Randomise which side the herd starts from and which way they walk
        const startSide = rng() > 0.5 ? 1 : -1;
        const velocity = crossDir.clone().multiplyScalar(WANDER_SPEED * startSide);

        const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        for (let g = 0; g < herdSize; g++) {
          const offset = new THREE.Vector3(
            (rng() - 0.5) * 6,
            0,
            (rng() - 0.5) * 6,
          );
          // Start herd spread from 5 m off road edge
          const lateralOffset = crossDir.clone().multiplyScalar(startSide * (5 + rng() * 4));
          const pos = herdOrigin.clone().add(offset).add(lateralOffset);

          const mesh = makeGoat();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(velocity.x, velocity.z) + (rng() - 0.5) * 0.4;
          this.object.add(mesh);

          this.goats.push({
            mesh,
            pos: pos.clone(),
            vel: velocity.clone().add(new THREE.Vector3((rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4)),
            hit: false,
            scattered: false,
          });
        }
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const goat of this.goats) {
      if (goat.hit) continue; // already knocked aside

      // Check hit
      if (goat.pos.distanceToSquared(carPos) < HIT_RADIUS * HIT_RADIUS) {
        goat.hit = true;
        this.penalty += 50;
        // Scatter velocity: random direction away from car
        const away = goat.pos.clone().sub(carPos);
        away.y = 0;
        if (away.lengthSq() < 0.001) away.set(1, 0, 0);
        away.normalize().multiplyScalar(SCATTER_SPEED + Math.random() * 2);
        goat.vel.copy(away);
        narrate('goat.hit');
        continue;
      }

      // Scatter nearby goats (within 8 m) when car approaches fast
      if (!goat.scattered && goat.pos.distanceToSquared(carPos) < 64) {
        const away = goat.pos.clone().sub(carPos);
        away.y = 0;
        if (away.lengthSq() > 0.001) {
          away.normalize().multiplyScalar(SCATTER_SPEED);
          goat.vel.copy(away);
          goat.scattered = true;
        }
      }

      // Move goat
      goat.pos.addScaledVector(goat.vel, dt);
      goat.mesh.position.copy(goat.pos);
      if (goat.vel.lengthSq() > 0.01) {
        goat.mesh.rotation.y = Math.atan2(goat.vel.x, goat.vel.z);
      }

      // Decelerate scattered goats back to wander speed
      if (goat.scattered && goat.vel.length() > WANDER_SPEED) {
        goat.vel.multiplyScalar(1 - dt * 1.5);
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
