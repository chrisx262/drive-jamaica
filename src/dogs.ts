import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Dog chase mechanic. Dogs scatter in town segments; when the car comes within
// range a dog breaks into a chase. The first chase per session fires the narrator.
// City dogs in Kingston famously look both ways before crossing (see GAME_SPEC).

const CHASE_TRIGGER_RADIUS = 12; // metres — starts the chase
const GIVE_UP_RADIUS = 40;       // metres — dog tires and stops
const CHASE_SPEED = 8;           // m/s
const CHASE_DURATION_MS = 5500;  // ms before dog gives up regardless of distance

// Road segments considered "town" for dog scatter
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Linstead Bypass',
  'Main Road',
  "King's Street",
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

interface DogInstance {
  mesh: THREE.Object3D;
  homePos: THREE.Vector3;
  state: 'idle' | 'chasing' | 'done';
  chaseStart: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private hasNarrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(20261001);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;
      let travelled = 0;
      let nextAt = 60 + rng() * 80;

      for (let i = seg.from + 1; i < seg.to; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);
        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Left perpendicular of travel direction
          const leftPerp = new THREE.Vector3(-dir.z, 0, dir.x);
          // Place dogs on either verge, 5-8 m off the road centre
          const side = rng() > 0.5 ? 1 : -1;
          const offset = 5 + rng() * 3;
          const pos = a.clone().lerp(b, t).addScaledVector(leftPerp, side * offset);
          pos.y = 0;
          const mesh = makeDog();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(-dir.x, -dir.z) + (rng() - 0.5) * 1.2;
          this.object.add(mesh);
          this.dogs.push({ mesh, homePos: pos.clone(), state: 'idle', chaseStart: 0 });
          nextAt += 80 + rng() * 100;
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    const now = performance.now();

    for (const dog of this.dogs) {
      if (dog.state === 'done') continue;
      const distSq = dog.mesh.position.distanceToSquared(carPos);

      if (dog.state === 'idle') {
        if (distSq < CHASE_TRIGGER_RADIUS * CHASE_TRIGGER_RADIUS) {
          dog.state = 'chasing';
          dog.chaseStart = now;
          if (!this.hasNarrated) {
            this.hasNarrated = true;
            narrate('dog.chase');
          }
        }
      } else {
        // Chasing: move toward the car
        const dist = Math.sqrt(distSq);
        if (dist > GIVE_UP_RADIUS || now - dog.chaseStart > CHASE_DURATION_MS) {
          dog.state = 'done';
          dog.mesh.position.copy(dog.homePos);
          continue;
        }
        const dir = carPos.clone().sub(dog.mesh.position).normalize();
        dog.mesh.position.addScaledVector(dir, CHASE_SPEED * dt);
        dog.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
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
