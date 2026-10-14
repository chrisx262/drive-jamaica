import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const DETECT_RADIUS = 22;   // meters — dog notices the car
const CHASE_SPEED = 7;      // m/s — dog sprint
const GIVE_UP_RADIUS = 55;  // meters — dog abandons chase
const BARK_INTERVAL_MS = 3200;

// Town road segments where dogs appear. Subset of route segment names.
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Main Road',   // Linstead
  "King's Street",
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

const DOGS_PER_TOWN_STRETCH = 3;

interface DogInstance {
  mesh: THREE.Group;
  restPos: THREE.Vector3;
  chasing: boolean;
  nextBark: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private narratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(7654);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;
      const spanLen = seg.to - seg.from;
      if (spanLen < 4) continue;

      for (let d = 0; d < DOGS_PER_TOWN_STRETCH; d++) {
        const frac = (d + 0.5 + rng() * 0.3) / DOGS_PER_TOWN_STRETCH;
        const ptIdx = Math.floor(seg.from + frac * spanLen);
        if (ptIdx >= road.points.length - 1) continue;

        const a = road.points[ptIdx];
        const b = road.points[ptIdx + 1];
        const dir = b.clone().sub(a).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        // Place dog on the LEFT side of the road (5-9 m from centre) — LEFT-hand traffic
        const lateralDist = 5 + rng() * 4;
        const pos = a.clone().addScaledVector(side, lateralDist);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI * (rng() > 0.5 ? 1 : 0);
        this.object.add(mesh);
        this.dogs.push({ mesh, restPos: pos.clone(), chasing: false, nextBark: 0 });
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    const carPos = car.position;

    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(carPos);

      if (!dog.chasing) {
        if (dist < DETECT_RADIUS) {
          dog.chasing = true;
          if (!this.narratedThisSession) {
            narrate('dog.chase');
            this.narratedThisSession = true;
          }
        }
      } else {
        if (dist > GIVE_UP_RADIUS) {
          // Return to rest
          dog.chasing = false;
          dog.mesh.position.copy(dog.restPos);
        } else {
          // Chase the car
          const towardCar = carPos.clone().sub(dog.mesh.position).setY(0);
          if (towardCar.lengthSq() > 0.01) {
            towardCar.normalize();
            dog.mesh.position.addScaledVector(towardCar, CHASE_SPEED * dt);
            dog.mesh.position.y = 0;
            dog.mesh.rotation.y = Math.atan2(towardCar.x, towardCar.z);
          }

          // Bark animation: bob up/down
          dog.mesh.position.y = Math.abs(Math.sin(now / 150)) * 0.12;

          if (now > dog.nextBark) {
            narrate('dog.bark');
            dog.nextBark = now + BARK_INTERVAL_MS + Math.random() * 1000;
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
