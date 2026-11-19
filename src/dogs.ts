import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_RADIUS = 18;      // m — dog starts chasing
const BARK_RADIUS = 30;       // m — dog perks up
const GIVE_UP_DIST = 55;      // m — dog abandons chase
const DOG_SPEED = 7.5;        // m/s — faster than a jogging pedestrian, slower than the car
const DOG_COUNT = 18;
const LATERAL_SPREAD = 4.5;   // m from road edge

type DogState = 'idle' | 'chasing' | 'retreating';

interface DogEntry {
  object: THREE.Group;
  origin: THREE.Vector3;
  state: DogState;
}

// Dogs module: public API matches Potholes (readonly object, update(car)).
// Dogs scatter near the urban first third of the route (Kingston / Half Way Tree).
// On first chase per session the narrator fires; never again (once is funny, twice is noise).
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogEntry[] = [];
  private narratorFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(5555);

    // Scatter in the first 60% of route points — city and town sections.
    // Every ~Nth point, roll for a dog, keeping them spread out.
    const cityEnd = Math.floor(road.points.length * 0.60);
    let lastDog = -60;

    for (let i = 10; i < cityEnd && this.dogs.length < DOG_COUNT; i++) {
      if (i - lastDog < 40) continue;        // minimum spacing
      if (rng() > 0.18) continue;            // 18% chance per eligible point

      const a = road.points[Math.max(i - 1, 0)];
      const b = road.points[Math.min(i + 1, road.points.length - 1)];
      const dir = b.clone().sub(a).normalize();
      const side = rng() > 0.5 ? 1 : -1;
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (5 + rng() * LATERAL_SPREAD));

      const pos = road.points[i].clone().add(perp);
      pos.y = 0;

      const dog = makeDog();
      dog.position.copy(pos);
      // Face along the road
      dog.rotation.y = Math.atan2(-dir.x, -dir.z) + (rng() - 0.5) * 0.6;
      this.object.add(dog);
      this.dogs.push({ object: dog, origin: pos.clone(), state: 'idle' });
      lastDog = i;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const d of this.dogs) {
      const dist = d.object.position.distanceTo(carPos);

      switch (d.state) {
        case 'idle':
          if (dist < CHASE_RADIUS) {
            d.state = 'chasing';
            if (!this.narratorFired) {
              this.narratorFired = true;
              narrate('dog.chase');
            }
          }
          break;

        case 'chasing': {
          if (dist > GIVE_UP_DIST) {
            d.state = 'retreating';
            break;
          }
          // Move toward car
          const tocar = carPos.clone().sub(d.object.position);
          tocar.y = 0;
          const len = tocar.length();
          if (len > 0.1) {
            tocar.normalize().multiplyScalar(Math.min(DOG_SPEED * dt, len));
            d.object.position.add(tocar);
            d.object.rotation.y = Math.atan2(-tocar.x, -tocar.z);
          }
          break;
        }

        case 'retreating': {
          // Walk back to spawn point
          const toOrigin = d.origin.clone().sub(d.object.position);
          toOrigin.y = 0;
          const len = toOrigin.length();
          if (len < 0.5) {
            d.state = 'idle';
          } else {
            toOrigin.normalize().multiplyScalar(Math.min((DOG_SPEED * 0.4) * dt, len));
            d.object.position.add(toOrigin);
            d.object.rotation.y = Math.atan2(-toOrigin.x, -toOrigin.z);
          }
          // Re-arm if car comes close again
          if (dist < BARK_RADIUS) d.state = 'chasing';
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
