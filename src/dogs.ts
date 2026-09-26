import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';
import { makeDog } from './animals';

// Dogs scattered in town segments. When the car comes within TRIGGER_RADIUS
// a dog starts chasing and barking. The narrator fires once per session.
// Public API mirrors potholes.ts: construct with RoadLike, call update(car, dt) each frame.

export const DOG_TRIGGER_RADIUS = 18; // meters — exported for debug overlay
const CHASE_SPEED = 6.5; // m/s
const CHASE_TIME = 4500; // ms before the dog gives up

// Road segment names where dogs appear — city streets and town centres.
// Countryside stretches intentionally excluded; goats live there instead.
const DOG_ZONES = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Wellington Street',
  'Main Road',
  "King's Street",
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

interface DogState {
  mesh: THREE.Group;
  chasing: boolean;
  chaseStart: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedFirstChase = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !DOG_ZONES.has(seg.name)) continue;
      if (rng() > 0.055) continue; // sparse placement

      const a = road.points[i - 1];
      const b = road.points[i];
      const pt = a.clone().lerp(b, rng());
      const dir = b.clone().sub(a).normalize();
      const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(4 + rng() * 8);
      pt.add(lateral);
      pt.y = 0;

      const mesh = makeDog();
      mesh.position.copy(pt);
      mesh.rotation.y = rng() * Math.PI * 2;
      this.object.add(mesh);
      this.dogs.push({ mesh, chasing: false, chaseStart: 0 });
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(car.position);

      if (!dog.chasing && dist < DOG_TRIGGER_RADIUS) {
        dog.chasing = true;
        dog.chaseStart = now;
        if (!this.narratedFirstChase) {
          this.narratedFirstChase = true;
          narrate('dog.chase');
        }
      }

      if (!dog.chasing) continue;

      if (now - dog.chaseStart > CHASE_TIME || dist > DOG_TRIGGER_RADIUS * 4) {
        dog.chasing = false;
        continue;
      }

      const dir = car.position.clone().sub(dog.mesh.position);
      const len = dir.length();
      if (len > 0.1) {
        dir.multiplyScalar(1 / len);
        dog.mesh.position.addScaledVector(dir, CHASE_SPEED * dt);
        dog.mesh.rotation.y = Math.atan2(dir.x, dir.z);
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
