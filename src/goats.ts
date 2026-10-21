import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross country roads unattended (GAME_SPEC).
// They appear on the Linstead–Moneague stretch and nearby hill-country segments.
const GOAT_SEGMENT_NAMES = [
  'Linstead Main Road',
  'Moneague Road',
  'Mount Rosser Road',
  "Guy's Hill Road",
  'A1 Highway',   // Linstead–Moneague section of the A1
];
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const HERDS_PER_KM = 0.6;       // intentionally sparse — surprise encounters
const WANDER_SPEED = 0.6;        // m/s lateral road-crossing drift
const SCATTER_SPEED = 3.8;       // m/s flee speed when car is close
const HIT_RADIUS = 2.4;          // meters — penalty zone
const SCATTER_RADIUS = 18;       // meters — start fleeing
export const GOAT_PENALTY = 150; // points deducted per hit (exported for scoring future hook)

interface GoatInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  roadPerp: THREE.Vector3; // unit vector crossing the road
  tOffset: number;         // lateral offset from road centre in world meters
  scattered: boolean;
  scatterDir: THREE.Vector3;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private goats: GoatInstance[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(99421);

    const segSet = new Set(GOAT_SEGMENT_NAMES);
    const inGoatZone = (ptIdx: number): boolean => {
      const seg = road.segments.find((s) => ptIdx >= s.from && ptIdx < s.to);
      return seg ? segSet.has(seg.name) : false;
    };

    let runLen = 0;
    let nextHerdAt = 400 + rng() * 600;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      while (runLen + segLen >= nextHerdAt) {
        if (inGoatZone(i)) {
          const t = (nextHerdAt - runLen) / segLen;
          const dir = b.clone().sub(a).normalize();
          const perp = new THREE.Vector3(-dir.z, 0, dir.x); // points left of travel
          const herdCentre = a.clone().lerp(b, t);
          const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const crossingDir = rng() < 0.5 ? 1 : -1; // left→right or right→left
          for (let g = 0; g < herdSize; g++) {
            const spreadLateral = (rng() - 0.5) * 6;
            const spreadAlong = (rng() - 0.5) * 8;
            const pos = herdCentre.clone()
              .addScaledVector(perp, spreadLateral)
              .addScaledVector(dir, spreadAlong);
            pos.y = 0;
            const mesh = makeGoat();
            mesh.position.copy(pos);
            mesh.rotation.y = Math.atan2(-perp.x * crossingDir, -perp.z * crossingDir);
            this.object.add(mesh);
            this.goats.push({
              mesh,
              pos: pos.clone(),
              roadPerp: perp.clone().multiplyScalar(crossingDir),
              tOffset: spreadLateral,
              scattered: false,
              scatterDir: new THREE.Vector3(),
              hit: false,
            });
          }
        }
        nextHerdAt += (1000 / HERDS_PER_KM) * (0.6 + rng() * 0.8);
      }
      runLen += segLen;
    }
  }

  // Returns penalty points incurred this frame (0 or GOAT_PENALTY per hit).
  update(car: Car, dt: number): number {
    const carPos = car.position;
    let penalty = 0;
    for (const goat of this.goats) {
      if (goat.hit) continue;
      const dist = goat.pos.distanceTo(carPos);

      if (dist < HIT_RADIUS) {
        goat.hit = true;
        penalty += GOAT_PENALTY;
        narrate('goat.hit');
        // Scatter violently on hit
        const away = goat.pos.clone().sub(carPos).setY(0);
        if (away.lengthSq() < 0.001) away.set(1, 0, 0);
        goat.scatterDir.copy(away.normalize());
        goat.scattered = true;
        continue;
      }

      if (dist < SCATTER_RADIUS && !goat.scattered) {
        goat.scattered = true;
        const away = goat.pos.clone().sub(carPos).setY(0);
        if (away.lengthSq() < 0.001) away.set(1, 0, 0);
        goat.scatterDir.copy(away.normalize());
      }

      if (goat.scattered) {
        goat.pos.addScaledVector(goat.scatterDir, SCATTER_SPEED * dt);
      } else {
        // Normal road-crossing wander
        goat.pos.addScaledVector(goat.roadPerp, WANDER_SPEED * dt);
      }
      goat.mesh.position.copy(goat.pos);
    }
    return penalty;
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
