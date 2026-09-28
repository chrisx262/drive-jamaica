import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs appear in towns; one chases and barks when the car passes within range.
// First chase per session fires a narrator line.
//
// Public API mirrors Potholes: construct with road, add .object to scene, call .update(car, dt).

const TRIGGER_RADIUS = 14; // m — car enters this range, dog starts chasing
const CHASE_SPEED = 9;     // m/s
const CHASE_DURATION = 7;  // seconds before dog gives up
const MIN_GAP = 220;       // m between dogs along town segments
const MAX_GAP = 600;

// Road segment names that count as town/urban — dogs spawn here.
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Linstead Bypass',
  'Church Road',
  'Main Road',
  "King's Street",
  'DaCosta Drive',
  'Northern Coastal Highway',
  'Ocho Rios Bypass',
]);

interface DogState {
  mesh: THREE.Group;
  spawnPos: THREE.Vector3;
  chasing: boolean;
  chaseTimer: number;
  done: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratorFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(31415);

    let nextAt = MIN_GAP;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const inTown = seg ? TOWN_SEGMENTS.has(seg.name) : false;

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Offset to left roadside kerb (drive on the left)
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(inTown ? 5 + rng() * 3 : 0);
        const pos = a.clone().lerp(b, t).add(lateral);
        pos.y = 0;

        if (inTown) {
          const dog = makeDog();
          dog.position.copy(pos);
          dog.rotation.y = Math.atan2(-dir.x, -dir.z) + (Math.PI / 2) * (rng() > 0.5 ? 1 : -1);
          this.object.add(dog);
          this.dogs.push({ mesh: dog, spawnPos: pos.clone(), chasing: false, chaseTimer: 0, done: false });
        }

        nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      if (dog.done) continue;

      const distSq = dog.mesh.position.distanceToSquared(car.position);

      if (!dog.chasing && distSq < TRIGGER_RADIUS * TRIGGER_RADIUS) {
        dog.chasing = true;
        dog.chaseTimer = CHASE_DURATION;
        if (!this.narratorFired) {
          this.narratorFired = true;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        dog.chaseTimer -= dt;
        if (dog.chaseTimer <= 0) {
          dog.chasing = false;
          dog.done = true;
          dog.mesh.position.copy(dog.spawnPos);
          continue;
        }
        const tocar = car.position.clone().sub(dog.mesh.position);
        const dist = tocar.length();
        if (dist > 0.5) {
          tocar.normalize().multiplyScalar(Math.min(CHASE_SPEED * dt, dist));
          dog.mesh.position.add(tocar);
          dog.mesh.rotation.y = Math.atan2(-tocar.x, -tocar.z);
          dog.mesh.position.y = Math.abs(Math.sin(performance.now() / 120)) * 0.18;
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
