import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross the Linstead–Moneague stretch unattended.
// Hitting one scores a penalty (narrator scolding + brief speed nudge).

const HIT_RADIUS = 2.0;      // m — collision radius per herd centre
const GOAT_SPEED = 2.0;      // m/s — unhurried amble
const CROSS_DIST = 18;       // m — total crossing width before goats disappear
const START_LATERAL = 12;    // m — goats start this far from road centre
const GOAT_SEGMENT = 'Linstead - Moneague Road';

interface Herd {
  goats: THREE.Object3D[];
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  walked: number;
  active: boolean;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const herdSegs = road.segments.filter((s) => s.name === GOAT_SEGMENT);
    for (const seg of herdSegs) {
      let travelled = 0;
      let nextAt = 80 + rng() * 120;
      for (let i = seg.from + 1; i < Math.min(seg.to, road.points.length); i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);
        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const fwd = b.clone().sub(a).normalize();
          // Perpendicular to road — goats walk across
          const side = rng() < 0.5 ? 1 : -1;
          const crossDir = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(side);
          const center = a.clone().lerp(b, t);
          // Start on the far edge, walk toward the opposite side
          const startPos = center.clone().addScaledVector(crossDir, -START_LATERAL);

          const herdSize = 2 + Math.floor(rng() * 3); // 2–4 goats
          const goats: THREE.Object3D[] = [];
          for (let g = 0; g < herdSize; g++) {
            const goat = makeGoat();
            // Scatter along the road axis so they're not stacked
            const scatter = (rng() - 0.5) * 5;
            goat.position.copy(startPos).addScaledVector(fwd, scatter);
            goat.position.y = 0;
            goat.rotation.y = Math.atan2(crossDir.x, crossDir.z);
            this.object.add(goat);
            goats.push(goat);
          }
          this.herds.push({
            goats,
            pos: startPos.clone(),
            dir: crossDir.clone(),
            walked: 0,
            active: true,
            hit: false,
          });
          nextAt += 100 + rng() * 160;
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      if (!herd.active) continue;

      herd.pos.addScaledVector(herd.dir, GOAT_SPEED * dt);
      herd.walked += GOAT_SPEED * dt;

      for (const goat of herd.goats) {
        goat.position.x = herd.pos.x;
        goat.position.z = herd.pos.z;
      }

      if (herd.walked >= CROSS_DIST) {
        herd.active = false;
        for (const goat of herd.goats) goat.visible = false;
        continue;
      }

      if (!herd.hit && herd.pos.distanceTo(carPos) < HIT_RADIUS) {
        herd.hit = true;
        narrate('goat.hit');
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
