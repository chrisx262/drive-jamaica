import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const DETECT_RADIUS = 20;   // m — dog gives chase when car enters this range
const GIVE_UP_RADIUS = 45;  // m — dog abandons chase when car has outrun it
const CHASE_SPEED = 7;      // m/s — top speed of a chasing dog
const RETURN_SPEED = 3;     // m/s — leisurely trot back to spawn point
const DOG_SPACING = 160;    // m between dogs along each town stretch

// Town road segments where dogs appear. Palisadoes (airport road) and the
// gorge/rural mountain roads are excluded — dogs live in settled communities.
const TOWN_SEGMENT_NAMES = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Nelson Mandela Highway',
  'Wellington Street',
  'Spanish Town Bypass',
  'Bog Walk Roundabout',
  'Church Road',
  'Main Road',
  "King's Street",
  'Milford Road',
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

interface DogState {
  obj: THREE.Group;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
}

// Dogs appear in towns; when the car enters DETECT_RADIUS, the dog chases
// and barks. Narrator fires once per session on first encounter.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedOnce = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENT_NAMES.has(seg.name)) continue;
      const pts = road.points.slice(seg.from, seg.to + 1);
      if (pts.length < 2) continue;
      this.spawnAlongStretch(pts, rng);
    }
  }

  private spawnAlongStretch(pts: THREE.Vector3[], rng: () => number): void {
    let dist = 0;
    let nextAt = DOG_SPACING * (0.2 + rng() * 0.6); // stagger first dog within stretch
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segLen = a.distanceTo(b);
      while (dist + segLen >= nextAt) {
        const t = (nextAt - dist) / segLen;
        const pos = a.clone().lerp(b, t);
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        // Place on either roadside, 5–8 m from road center
        const side = rng() > 0.5 ? 1 : -1;
        pos.addScaledVector(perp, side * (5 + rng() * 3));
        pos.y = 0;

        const dog = makeDog();
        dog.position.copy(pos);
        dog.rotation.y = rng() * Math.PI * 2;
        this.object.add(dog);
        this.dogs.push({ obj: dog, home: pos.clone(), pos: pos.clone(), chasing: false });

        nextAt += DOG_SPACING + rng() * 80;
      }
      dist += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const distSq = dog.pos.distanceToSquared(carPos);

      if (!dog.chasing && distSq < DETECT_RADIUS * DETECT_RADIUS) {
        dog.chasing = true;
        if (!this.narratedOnce) {
          this.narratedOnce = true;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        if (distSq > GIVE_UP_RADIUS * GIVE_UP_RADIUS) {
          dog.chasing = false;
        } else {
          const towardCar = new THREE.Vector3().subVectors(carPos, dog.pos).setY(0);
          const len = towardCar.length();
          if (len > 0.1) {
            towardCar.divideScalar(len);
            dog.pos.addScaledVector(towardCar, Math.min(CHASE_SPEED * dt, len));
            dog.obj.position.copy(dog.pos);
            dog.obj.rotation.y = Math.atan2(towardCar.x, towardCar.z);
          }
        }
      } else {
        // Trot back to spawn point after giving up
        const toHome = new THREE.Vector3().subVectors(dog.home, dog.pos).setY(0);
        const homeLen = toHome.length();
        if (homeLen > 0.05) {
          toHome.divideScalar(homeLen);
          dog.pos.addScaledVector(toHome, Math.min(RETURN_SPEED * dt, homeLen));
          dog.obj.position.copy(dog.pos);
          if (homeLen > 0.5) dog.obj.rotation.y = Math.atan2(toHome.x, toHome.z);
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
