import * as THREE from 'three';
import { makeGoat } from './animals';
import { narrate } from './narrator';
import type { Car } from './car';
import type { RoadLike } from './road';

const TRIGGER_RADIUS = 55; // m — herd starts crossing when car gets this close
const HIT_RADIUS = 1.6; // m — collision with an individual goat
const CROSS_SPEED = 1.6; // m/s — slow amble across the road
const CROSS_DISTANCE = 22; // m — total distance the herd travels across

// Goats appear on the country roads of the Linstead–Moneague stretch (GAME_SPEC).
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface GoatHerd {
  group: THREE.Group;
  origin: THREE.Vector3;
  crossDir: THREE.Vector3;
  triggered: boolean;
  crossed: number; // distance traveled this crossing
  goatPositions: THREE.Vector3[]; // local offsets from group
}

export let hitGoats = 0; // exported for future scoring integration

// Goat herds cross country roads unattended. Hitting one fires a narrator
// scolding and bumps hitGoats. Score penalty integration deferred to scoring module.
export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;

      let dist = 0;
      let nextAt = 200 + rng() * 300; // herds every 200–500 m

      for (let i = seg.from + 1; i < seg.to && i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const len = a.distanceTo(b);

        while (dist + len >= nextAt) {
          const t = (nextAt - dist) / len;
          const dir = b.clone().sub(a).normalize();
          // Perpendicular to road — the direction the herd crosses
          const perp = new THREE.Vector3(dir.z, 0, -dir.x);
          // Start the herd on one side of the road
          const side = rng() > 0.5 ? 1 : -1;
          const origin = a.clone().lerp(b, t)
            .addScaledVector(perp, side * (CROSS_DISTANCE / 2 + 2));
          origin.y = 0;

          const herdSize = 2 + Math.floor(rng() * 3); // 2–4 goats
          const group = new THREE.Group();
          group.position.copy(origin);
          this.object.add(group);

          const localOffsets: THREE.Vector3[] = [];
          for (let g = 0; g < herdSize; g++) {
            const goat = makeGoat();
            const lx = (rng() - 0.5) * 3.5;
            const lz = (rng() - 0.5) * 3.5;
            goat.position.set(lx, 0, lz);
            goat.rotation.y = rng() * Math.PI * 2;
            group.add(goat);
            localOffsets.push(new THREE.Vector3(lx, 0, lz));
          }

          this.herds.push({
            group,
            origin: origin.clone(),
            crossDir: perp.clone().multiplyScalar(-side), // crossing toward other side
            triggered: false,
            crossed: 0,
            goatPositions: localOffsets,
          });

          nextAt += 200 + rng() * 300;
        }
        dist += len;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (!herd.triggered) {
        if (herd.group.position.distanceToSquared(carPos) < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          herd.triggered = true;
        }
        continue;
      }

      if (herd.crossed >= CROSS_DISTANCE) continue; // done crossing

      const step = CROSS_SPEED * dt;
      herd.group.position.addScaledVector(herd.crossDir, step);
      herd.crossed += step;

      // Face the crossing direction
      herd.group.rotation.y = Math.atan2(herd.crossDir.x, herd.crossDir.z);

      // Per-goat collision detection (world position = group pos + local offset)
      for (const localOff of herd.goatPositions) {
        const world = herd.group.position.clone().add(localOff);
        if (world.distanceToSquared(carPos) < HIT_RADIUS * HIT_RADIUS) {
          hitGoats++;
          narrate('goat.hit');
          // Remove from collision pool so each goat only scores once
          herd.goatPositions.splice(herd.goatPositions.indexOf(localOff), 1);
          break;
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
