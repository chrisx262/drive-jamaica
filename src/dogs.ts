import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const TRIGGER_RADIUS = 14; // m — dog wakes up and gives chase
const CHASE_RADIUS = 60;   // m — dog gives up beyond this
const DOG_SPEED = 8;       // m/s (fast enough to catch a slow driver)
const CHASE_DURATION = 6;  // s
const SPAWN_GAP_MIN = 200;
const SPAWN_GAP_MAX = 500;

// Segments where dogs live (towns and city stretches).
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
  'Linstead - Moneague Road',
]);

interface DogInstance {
  object: THREE.Group;
  spawn: THREE.Vector3;
  pos: THREE.Vector3;
  active: boolean;
  chaseTimer: number;
  narrated: boolean;
}

// Dogs appear in towns; when the car passes within TRIGGER_RADIUS a dog chases
// and barks. The narrator fires once on the first chase of the session.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private sessionNarrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    // Walk the route; scatter dogs inside town segments.
    let travelled = 0;
    let nextAt = 80 + rng() * SPAWN_GAP_MIN;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const inTown = seg ? TOWN_SEGMENTS.has(seg.name) : false;

      while (travelled + segLen >= nextAt) {
        if (inTown) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Spawn on the roadside (right side — left-hand traffic, so drivers' left = road left)
          const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(5.5 + rng() * 2.5);
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;
          const mesh = makeDog();
          mesh.position.copy(pos);
          // Face toward road
          mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
          this.object.add(mesh);
          this.dogs.push({ object: mesh, spawn: pos.clone(), pos: pos.clone(), active: false, chaseTimer: 0, narrated: false });
        }
        nextAt += SPAWN_GAP_MIN + rng() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const distSq = dog.pos.distanceToSquared(car.position);

      if (!dog.active) {
        if (distSq < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          dog.active = true;
          dog.chaseTimer = CHASE_DURATION;
          if (!this.sessionNarrated) {
            this.sessionNarrated = true;
            narrate('dog.chase');
          }
        }
      } else {
        dog.chaseTimer -= dt;
        const dist = Math.sqrt(distSq);
        if (dog.chaseTimer <= 0 || dist > CHASE_RADIUS) {
          // Give up — trot back toward spawn
          dog.active = false;
          dog.pos.lerp(dog.spawn, Math.min(2 * dt, 1));
          dog.object.position.copy(dog.pos);
        } else {
          // Chase the car
          const tocar = car.position.clone().sub(dog.pos);
          tocar.y = 0;
          const len = tocar.length();
          if (len > 0.1) {
            tocar.divideScalar(len);
            dog.pos.addScaledVector(tocar, Math.min(DOG_SPEED * dt, len));
            dog.object.position.copy(dog.pos);
            dog.object.rotation.y = Math.atan2(-tocar.x, -tocar.z);
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
