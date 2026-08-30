import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs appear in towns; when the car passes within range a dog chases and barks.
// Narrator fires once per session on the first chase.
// Pattern matches src/potholes.ts: class with tiny public API, mulberry32 RNG.

const CHASE_RADIUS = 18;        // m — trigger distance
const GIVE_UP_RADIUS = 45;      // m — dog stops chasing beyond this
const DOG_SPEED = 9;            // m/s top sprint speed (compressed world ~28 km/h)
const CHASE_DURATION = 7_000;   // ms max chase time

// Segments where dogs are placed (town / built-up sections).
// Defined by the route segment name substrings — conservative list.
const TOWN_SEGMENT_PATTERNS = [
  'Windward',
  'Mountain View',
  'Trafalgar',
  'Hope Road',
  'Hagley',
  'Spanish Town',
  'White Church',
  'Wellington',
  'King\'s Street',
  'Church Road',
  'Main Road',
  'Linstead',
  'DaCosta',
  'Northern Coastal',
];

interface DogInstance {
  obj: THREE.Group;
  restPos: THREE.Vector3;
  chasing: boolean;
  chaseTimer: number;
}

export class Dogs {
  readonly objects: THREE.Group;
  private dogs: DogInstance[] = [];
  private narratedChase = false;

  constructor(road: RoadLike, scene: THREE.Scene) {
    this.objects = new THREE.Group();
    scene.add(this.objects);

    const rng = mulberry32(2027);
    const townIndices: number[] = [];

    for (const seg of road.segments) {
      const isTown = TOWN_SEGMENT_PATTERNS.some((p) => seg.name.includes(p));
      if (!isTown) continue;
      for (let i = seg.from; i < seg.to - 1; i++) townIndices.push(i);
    }

    // Place one dog roughly every 200-350 m of town road.
    let spacing = 200 + rng() * 150;
    let accumulated = 0;
    for (let idx = 1; idx < townIndices.length; idx++) {
      const a = road.points[townIndices[idx - 1]];
      const b = road.points[townIndices[idx]];
      accumulated += a.distanceTo(b);
      if (accumulated < spacing) continue;
      accumulated = 0;
      spacing = 200 + rng() * 150;

      const t = rng();
      const pos = a.clone().lerp(b, t);
      const dir = b.clone().sub(a).normalize();
      // Place dog on the roadside (left or right), 6-12 m laterally
      const side = rng() > 0.5 ? 1 : -1;
      const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (6 + rng() * 6));
      pos.add(lateral);
      pos.y = 0;

      const obj = makeDog();
      obj.position.copy(pos);
      // Face along road direction
      obj.rotation.y = Math.atan2(dir.x, dir.z);
      this.objects.add(obj);
      this.dogs.push({ obj, restPos: pos.clone(), chasing: false, chaseTimer: 0 });
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dist = dog.obj.position.distanceTo(carPos);

      if (!dog.chasing) {
        if (dist < CHASE_RADIUS) {
          dog.chasing = true;
          dog.chaseTimer = CHASE_DURATION;
          if (!this.narratedChase) {
            this.narratedChase = true;
            narrate('dog.chase');
          }
        }
        continue;
      }

      // Chasing — move toward car
      dog.chaseTimer -= dt * 1000;
      const gaveUp = dog.chaseTimer <= 0 || dist > GIVE_UP_RADIUS;
      if (gaveUp) {
        dog.chasing = false;
        // Return to rest position
        const toRest = dog.restPos.clone().sub(dog.obj.position);
        if (toRest.length() > 0.5) {
          toRest.normalize().multiplyScalar(DOG_SPEED * 0.5 * dt);
          dog.obj.position.add(toRest);
        } else {
          dog.obj.position.copy(dog.restPos);
        }
        continue;
      }

      const toCar = carPos.clone().sub(dog.obj.position);
      toCar.y = 0;
      const len = toCar.length();
      if (len > 0.1) {
        toCar.normalize().multiplyScalar(Math.min(DOG_SPEED * dt, len));
        dog.obj.position.add(toCar);
        dog.obj.rotation.y = Math.atan2(toCar.x, toCar.z);
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
