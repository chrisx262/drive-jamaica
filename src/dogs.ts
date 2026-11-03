import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs appear on town/urban sections of the route. When the car passes
// within ACTIVATION_RADIUS they chase it; they give up at GIVE_UP_RADIUS.
// The narrator fires once per session on the first chase.

const TOWN_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Stanton Terrace',
  'Fairway Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Main Road',
  "King's Street",
  'Church Road',
  'Linstead Bypass',
]);

const DOG_SPACING = 130;      // meters between dogs along town roads
const ACTIVATION_RADIUS = 22; // m — dog wakes up and gives chase
const GIVE_UP_RADIUS = 52;    // m — dog abandons the chase
const DOG_SPEED = 6.8;        // m/s at full sprint

interface DogState {
  mesh: THREE.Object3D;
  chasing: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private chaseFired = false; // narrator fires only once per session

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(5501);

    let travelled = 0;
    let nextAt = DOG_SPACING * (0.3 + rng() * 0.7);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);

      if (!seg || !TOWN_SEGMENTS.has(seg.name)) {
        travelled += segLen;
        // Reset spacing so dogs don't bunch up at the next town entry
        nextAt = travelled + DOG_SPACING * (0.3 + rng() * 0.7);
        continue;
      }

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Place on the verge; alternate sides with slight randomness
        const side = rng() < 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (4.5 + rng() * 3.5));
        const pos = a.clone().lerp(b, t).add(lateral);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);
        this.dogs.push({ mesh, chasing: false });

        nextAt += DOG_SPACING * (0.3 + rng() * 0.7);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const distSq = dog.mesh.position.distanceToSquared(car.position);

      if (!dog.chasing && distSq < ACTIVATION_RADIUS * ACTIVATION_RADIUS) {
        dog.chasing = true;
        if (!this.chaseFired) {
          this.chaseFired = true;
          narrate('dog.chase');
        }
      }
      if (dog.chasing && distSq > GIVE_UP_RADIUS * GIVE_UP_RADIUS) {
        dog.chasing = false;
      }

      if (dog.chasing) {
        const toward = car.position.clone().sub(dog.mesh.position);
        toward.y = 0;
        const len = toward.length();
        if (len > 0.1) {
          const step = Math.min(DOG_SPEED * dt, len);
          toward.multiplyScalar(step / len);
          dog.mesh.position.add(toward);
          dog.mesh.rotation.y = Math.atan2(toward.x, toward.z);
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
