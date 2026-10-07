import * as THREE from 'three';
import { makeDog } from './animals';
import type { Car } from './car';
import type { RoadLike } from './road';
import { narrate } from './narrator';

// Dog chase mechanic.
// Dogs appear beside the road in town sections. When the car passes within
// TRIGGER_RADIUS they give chase; they stop chasing beyond GIVE_UP_RADIUS.
// The narrator fires once per session on the first chase.
//
// Public API matches the potholes.ts pattern: construct with (road), add
// .object to the scene, call .update(car, dt) each frame.

const TRIGGER_RADIUS = 18;   // m — how close before the dog bolts
const GIVE_UP_RADIUS = 38;   // m — dog abandons chase beyond this
const CHASE_SPEED    = 7.5;  // m/s — fast dog
const BARK_INTERVAL  = 3200; // ms between bark narrator re-fires (after the first)
const SPAWN_GAP_MIN  = 120;  // m between dog spawn points (compressed world)
const SPAWN_GAP_MAX  = 300;

// Town sections: segment name substrings where dogs spawn.
// Dogs do NOT spawn on the Palisadoes strip or in the gorge.
const TOWN_SEGMENTS = [
  'Harbour View', 'Windward', 'Kingston', 'Half Way Tree', 'Spanish Town',
  'Linstead', 'Moneague',
];

interface DogState {
  mesh: THREE.Group;
  rest: THREE.Vector3;   // idle position beside the road
  chasing: boolean;
  lastBarkAt: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedOnce = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(20261007);

    // Spawn dogs only in town sections.
    const townIndices = new Set<number>();
    for (const seg of road.segments) {
      const inTown = TOWN_SEGMENTS.some((t) => seg.name.includes(t));
      if (!inTown) continue;
      for (let i = seg.from; i <= seg.to; i++) townIndices.add(i);
    }

    let nextAt = SPAWN_GAP_MIN + rng() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        if (townIndices.has(i)) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Place dog on the LEFT verge (matching left-hand traffic)
          const lateral = new THREE.Vector3(dir.z, 0, -dir.x)
            .multiplyScalar(5.2 + rng() * 2.0); // 5–7 m left of centre
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          // Face across the road (toward the car's likely path)
          mesh.rotation.y = Math.atan2(-dir.z, dir.x) + Math.PI / 2;
          this.object.add(mesh);
          this.dogs.push({ mesh, rest: pos.clone(), chasing: false, lastBarkAt: 0 });
        }
        nextAt += SPAWN_GAP_MIN + rng() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    const now = performance.now();

    for (const dog of this.dogs) {
      const distSq = dog.mesh.position.distanceToSquared(carPos);
      const dist   = Math.sqrt(distSq);

      if (!dog.chasing) {
        if (dist < TRIGGER_RADIUS) {
          dog.chasing = true;
          if (!this.narratedOnce) {
            this.narratedOnce = true;
            narrate('dog.chase');
            dog.lastBarkAt = now;
          }
        }
      }

      if (dog.chasing) {
        if (dist > GIVE_UP_RADIUS) {
          // Give up — trot back to rest position
          const toRest = dog.rest.clone().sub(dog.mesh.position);
          if (toRest.length() < 0.5) {
            dog.chasing = false;
            dog.mesh.position.copy(dog.rest);
          } else {
            toRest.normalize().multiplyScalar(CHASE_SPEED * 0.5 * dt);
            dog.mesh.position.add(toRest);
          }
        } else {
          // Chase the car
          const toCar = carPos.clone().sub(dog.mesh.position);
          toCar.y = 0;
          if (toCar.length() > 0.1) {
            dog.mesh.rotation.y = Math.atan2(toCar.x, toCar.z);
            toCar.normalize().multiplyScalar(CHASE_SPEED * dt);
            dog.mesh.position.add(toCar);
          }
          // Repeat bark narrator after interval
          if (now - dog.lastBarkAt > BARK_INTERVAL) {
            narrate('dog.chase');
            dog.lastBarkAt = now;
          }
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
