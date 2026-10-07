import * as THREE from 'three';
import { makeGoat } from './animals';
import type { Car } from './car';
import type { RoadLike } from './road';
import { narrate } from './narrator';

// Goat herd crossing mechanic.
// Herds appear on country roads (Linstead–Moneague stretch). Goats wander
// slowly across the road; hitting one applies a score penalty and fires a
// narrator scolding.
//
// Public API matches potholes.ts: construct with (road), add .object to scene,
// call .update(car, dt) each frame. Exposes .goatsHit for the scoring system.

const HIT_RADIUS     = 1.6;  // m — goat collision sphere
const HERD_SIZE_MIN  = 3;
const HERD_SIZE_MAX  = 7;
const CROSS_SPEED    = 0.9;  // m/s — slow amble
const SPREAD         = 4.5;  // m — max lateral spread within herd
const HERD_GAP_MIN   = 400;  // m between herds (compressed world)
const HERD_GAP_MAX   = 900;
const NEAR_MISS_DIST = 4.0;  // m — triggers near-miss narrator, not a hit

// Country sections where herds spawn.
const COUNTRY_SEGMENTS = ['Linstead', 'Moneague', 'Ewarton', 'Riversdale', 'Mount Rosser'];

interface Goat {
  mesh: THREE.Group;
  pos: THREE.Vector3;    // current position in world space
  crossDir: THREE.Vector3; // perpendicular direction it's wandering
  hit: boolean;
}

interface Herd {
  goats: Goat[];
  active: boolean;       // false once all goats are past the road
  nearMissFired: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  goatsHit = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(20261007 ^ 0xdeadbeef);

    const countryIndices = new Set<number>();
    for (const seg of road.segments) {
      const inCountry = COUNTRY_SEGMENTS.some((c) => seg.name.includes(c));
      if (!inCountry) continue;
      for (let i = seg.from; i <= seg.to; i++) countryIndices.add(i);
    }

    let nextAt = HERD_GAP_MIN + rng() * (HERD_GAP_MAX - HERD_GAP_MIN);
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        if (countryIndices.has(i)) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Crossing direction: perpendicular (right-to-left across the road in
          // the direction of travel — simulates goats coming from the left verge
          // since we drive on the LEFT)
          const crossDir = new THREE.Vector3(-dir.z, 0, dir.x);

          const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const herd: Herd = { goats: [], active: true, nearMissFired: false };

          for (let g = 0; g < herdSize; g++) {
            const lateralOffset = (rng() - 0.5) * SPREAD;
            const forwardOffset = (rng() - 0.5) * 3.5;
            const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(lateralOffset);
            const forward = dir.clone().multiplyScalar(forwardOffset);
            const spawnPos = a.clone().lerp(b, t).add(lateral).add(forward);
            // Start goats on the left verge (6–10 m left of centre)
            spawnPos.addScaledVector(crossDir, -(6 + rng() * 4));
            spawnPos.y = 0;

            const mesh = makeGoat();
            mesh.position.copy(spawnPos);
            mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
            this.object.add(mesh);

            herd.goats.push({ mesh, pos: spawnPos.clone(), crossDir: crossDir.clone(), hit: false });
          }

          this.herds.push(herd);
        }
        nextAt += HERD_GAP_MIN + rng() * (HERD_GAP_MAX - HERD_GAP_MIN);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (!herd.active) continue;

      let allPast = true;
      for (const goat of herd.goats) {
        if (goat.hit) continue;

        // Move goat across the road
        goat.pos.addScaledVector(goat.crossDir, CROSS_SPEED * dt);
        goat.mesh.position.copy(goat.pos);

        // Stop once far enough across (20 m past centre = safely in right verge)
        const crossProgress = goat.pos.dot(goat.crossDir);
        if (crossProgress < 20) allPast = false;

        const dist = goat.pos.distanceTo(carPos);
        if (dist < HIT_RADIUS) {
          goat.hit = true;
          this.goatsHit++;
          // Visually flatten the goat
          goat.mesh.scale.set(1, 0.15, 1);
          narrate('goat.hit');
        } else if (!herd.nearMissFired && dist < NEAR_MISS_DIST) {
          herd.nearMissFired = true;
          narrate('goat.nearmiss');
        }
      }

      if (allPast) herd.active = false;
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
