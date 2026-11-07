import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Dogs appear in town sections. When the car passes within CHASE_RANGE,
// the dog runs toward it until it has gone too far from home, then gives up.
// Narrator fires once per session on the first chase — per GAME_SPEC.

const CHASE_RANGE = 22;      // metres — car triggers the chase
const GIVE_UP_DIST = 55;     // metres from home — dog turns back
const CHASE_SPEED = 7.5;     // m/s when in pursuit
const DOG_SPACING_MIN = 70;  // metres between dogs in town
const DOG_SPACING_MAX = 220;

// Road segment names that count as "town" for dog placement.
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Stanton Terrace',
  'Fairway Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Eastwood Park Road',
  'South Odeon Avenue',
  'Spanish Town Road',
  'Main Road',
  'Church Road',
  'Barrett Street',
  'Wellington Street',
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

interface DogSpawn {
  object: THREE.Group;
  homePos: THREE.Vector3;
  chasing: boolean;
  gaveUp: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogSpawn[] = [];
  private firstChaseThisSession = true;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9001);

    let nextAt = DOG_SPACING_MIN + rng() * DOG_SPACING_MAX;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i - 1 >= s.from && i - 1 < s.to);

      while (travelled + segLen >= nextAt) {
        if (seg && TOWN_SEGMENTS.has(seg.name)) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Place dog on the verge — 5–10 m off the road
          const side = rng() > 0.5 ? 1 : -1;
          const vergeOffset = new THREE.Vector3(-dir.z, 0, dir.x)
            .multiplyScalar(side * (5 + rng() * 5));
          const pos = a.clone().lerp(b, t).add(vergeOffset);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          this.object.add(mesh);
          this.dogs.push({ object: mesh, homePos: pos.clone(), chasing: false, gaveUp: false });
        }
        nextAt += DOG_SPACING_MIN + rng() * (DOG_SPACING_MAX - DOG_SPACING_MIN);
      }
      travelled += segLen;
    }
  }

  update(dt: number, car: Car): void {
    const carPos = car.position;

    for (const dog of this.dogs) {
      if (dog.gaveUp) continue;

      const distFromHome = dog.object.position.distanceTo(dog.homePos);

      if (!dog.chasing) {
        if (dog.homePos.distanceTo(carPos) < CHASE_RANGE) {
          dog.chasing = true;
          if (this.firstChaseThisSession) {
            this.firstChaseThisSession = false;
            narrate('dog.chase');
          }
        }
      }

      if (dog.chasing) {
        if (distFromHome > GIVE_UP_DIST) {
          // Give up — snap back to home so we don't have to animate the return
          dog.gaveUp = true;
          dog.object.position.copy(dog.homePos);
          continue;
        }
        // Run toward car
        const tocar = carPos.clone().sub(dog.object.position);
        tocar.y = 0;
        const len = tocar.length();
        if (len > 0.3) {
          tocar.normalize().multiplyScalar(CHASE_SPEED * dt);
          dog.object.position.add(tocar);
          dog.object.lookAt(carPos.x, dog.object.position.y, carPos.z);
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
