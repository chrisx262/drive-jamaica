import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const TRIGGER_RADIUS = 18;  // world meters — dog starts chasing
const GIVEUP_RADIUS = 40;   // world meters — dog gives up
const DOG_SPEED = 6;        // m/s
const HOME_SPEED = 3;       // m/s (trot home)
const COOLDOWN = 8;         // seconds before dog can chase again
const SPACING_MIN = 55;     // meters between dogs within a town segment
const SPACING_MAX = 95;

// Segments where dogs appear. Matches GAME_SPEC: "chase through towns".
const TOWN_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Main Road',       // Linstead
  'DaCosta Drive',   // Ocho Rios
]);

interface DogState {
  obj: THREE.Group;
  home: THREE.Vector3;
  chasing: boolean;
  cooldown: number;
}

// Dogs scatter near town segments. When the car passes within TRIGGER_RADIUS
// a dog starts chasing; it gives up at GIVEUP_RADIUS and trots home.
// The narrator fires once per session on the first chase.
export class Dogs {
  readonly object: THREE.Group;
  private readonly dogs: DogState[] = [];
  private firstChaseFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;

      let travelled = 0;
      let nextAt = SPACING_MIN + rng() * (SPACING_MAX - SPACING_MIN);

      for (let i = seg.from + 1; i < seg.to; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);

        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const pt = a.clone().lerp(b, t);
          const dir = b.clone().sub(a).normalize();
          // Place dog on the roadside, 4–6 m lateral offset
          const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(4 + rng() * 2);
          const home = new THREE.Vector3(pt.x + lateral.x, 0, pt.z + lateral.z);

          const obj = makeDog();
          obj.position.copy(home);
          this.object.add(obj);
          this.dogs.push({ obj, home, chasing: false, cooldown: 0 });

          nextAt += SPACING_MIN + rng() * (SPACING_MAX - SPACING_MIN);
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const dog of this.dogs) {
      dog.cooldown = Math.max(0, dog.cooldown - dt);
      const distSq = dog.obj.position.distanceToSquared(carPos);

      if (!dog.chasing) {
        if (dog.cooldown <= 0 && distSq < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          dog.chasing = true;
          if (!this.firstChaseFired) {
            narrate('dog.chase');
            this.firstChaseFired = true;
          }
        } else {
          // Trot back to home position
          const toHome = dog.home.clone().sub(dog.obj.position);
          toHome.y = 0;
          if (toHome.lengthSq() > 0.1) {
            toHome.normalize().multiplyScalar(HOME_SPEED * dt);
            dog.obj.position.add(toHome);
            dog.obj.rotation.y = Math.atan2(toHome.x, toHome.z);
          }
        }
      } else {
        if (distSq > GIVEUP_RADIUS * GIVEUP_RADIUS) {
          dog.chasing = false;
          dog.cooldown = COOLDOWN;
        } else {
          // Chase the car
          const tocar = carPos.clone().sub(dog.obj.position);
          tocar.y = 0;
          if (tocar.lengthSq() > 0.001) {
            tocar.normalize().multiplyScalar(DOG_SPEED * dt);
            dog.obj.position.add(tocar);
            dog.obj.rotation.y = Math.atan2(tocar.x, tocar.z);
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
