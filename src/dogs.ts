import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dog segments: road names where dogs are scattered.
// Palisadoes excluded (owner rule: government showcase road).
// Kingston famously has street dogs that understand traffic.
const DOG_SEGMENT_NAMES = [
  'Windward Road',
  'Mountain View Avenue',
  'South Camp Road',
  'Maxfield Avenue',
  'Hagley Park Road',
  'Spanish Town Road',
  'Linstead Main Road',
];
const DOGS_PER_KM = 1.8; // tune via owner feedback
const BARK_RADIUS = 22;   // meters — dog faces car, audio bark
const CHASE_RADIUS = 14;  // meters — dog runs after car
const CHASE_SPEED = 7.5;  // m/s (~27 km/h — car outruns it above that)

interface DogInstance {
  mesh: THREE.Group;
  origin: THREE.Vector3;
  pos: THREE.Vector3;
  roadDir: THREE.Vector3;
  chasing: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private chaseFiredThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(31337);

    // Identify which polyline points belong to dog segments
    const segSet = new Set(DOG_SEGMENT_NAMES);
    const inDogZone = (ptIdx: number): boolean => {
      const seg = road.segments.find((s) => ptIdx >= s.from && ptIdx < s.to);
      return seg ? segSet.has(seg.name) : false;
    };

    let runLen = 0;
    let nextDogAt = 30 + rng() * 60; // offset so first dog isn't right at segment start
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      while (runLen + segLen >= nextDogAt) {
        if (inDogZone(i)) {
          const t = (nextDogAt - runLen) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Place dog on the roadside — 4–8 m off the centre, left or right
          const side = rng() < 0.5 ? 1 : -1;
          const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (4 + rng() * 4));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;
          const mesh = makeDog();
          mesh.position.copy(pos);
          // Face along the road initially
          mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
          this.object.add(mesh);
          this.dogs.push({ mesh, origin: pos.clone(), pos: pos.clone(), roadDir: dir.clone(), chasing: false });
        }
        nextDogAt += (1000 / DOGS_PER_KM) * (0.7 + rng() * 0.6);
      }
      runLen += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dist = dog.pos.distanceTo(carPos);

      if (dist < CHASE_RADIUS) {
        // Chase: run toward the car
        dog.chasing = true;
        const towardCar = carPos.clone().sub(dog.pos).setY(0).normalize();
        dog.pos.addScaledVector(towardCar, CHASE_SPEED * dt);
        dog.mesh.position.copy(dog.pos);
        dog.mesh.rotation.y = Math.atan2(-towardCar.x, -towardCar.z);
        if (!this.chaseFiredThisSession) {
          this.chaseFiredThisSession = true;
          narrate('dog.chase');
        }
      } else if (dist < BARK_RADIUS) {
        // Bark zone: face the car but don't move
        dog.chasing = false;
        const towardCar = carPos.clone().sub(dog.pos).setY(0);
        if (towardCar.lengthSq() > 0.001) {
          towardCar.normalize();
          dog.mesh.rotation.y = Math.atan2(-towardCar.x, -towardCar.z);
        }
      } else {
        // Return to origin if was chasing
        if (dog.chasing) {
          const toOrigin = dog.origin.clone().sub(dog.pos);
          if (toOrigin.length() < 0.5) {
            dog.pos.copy(dog.origin);
            dog.chasing = false;
          } else {
            dog.pos.addScaledVector(toOrigin.normalize(), CHASE_SPEED * 0.5 * dt);
          }
          dog.mesh.position.copy(dog.pos);
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
