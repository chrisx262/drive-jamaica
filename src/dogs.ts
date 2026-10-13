import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Town segments where dogs hang out and chase the car.
// City dogs in Kingston famously look both ways — they know the roads.
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Spanish Town Road',
  'White Church Street',
  'Wellington Street',
  'Barrett Street',
  'Church Road',
  'Main Road',
  "King's Street",
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

const DOG_SPACING = 180;   // meters between dog spawns in town segments
const DETECT_RANGE = 22;   // car must be within this to wake a dog (world meters)
const CHASE_RANGE  = 35;   // dog gives up beyond this
const CHASE_SPEED  = 7.5;  // m/s max dog sprint (compressed world)

interface DogInstance {
  mesh: THREE.Group;
  home: THREE.Vector3;       // spawn position (roadside)
  chasing: boolean;
  heading: number;           // run direction (follows car heading)
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private narratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9137);

    let accumulated = 0;
    let nextSpawn = DOG_SPACING * (0.3 + rng() * 0.7);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const isTown = seg ? TOWN_SEGMENTS.has(seg.name) : false;

      while (isTown && accumulated + segLen >= nextSpawn) {
        const t = (nextSpawn - accumulated) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Offset dog to the LEFT roadside (left lane = +perpendicular in our coord system)
        const perp = new THREE.Vector3(dir.z, 0, -dir.x);
        const side = rng() < 0.55 ? 1 : -1; // mostly left side
        const home = a.clone().lerp(b, t).addScaledVector(perp, side * (5 + rng() * 3));
        home.y = 0;

        const mesh = makeDog();
        mesh.position.copy(home);
        mesh.rotation.y = Math.atan2(-dir.x, -dir.z) + (Math.PI / 2) * (rng() - 0.5);
        this.object.add(mesh);
        this.dogs.push({ mesh, home: home.clone(), chasing: false, heading: 0 });

        nextSpawn += DOG_SPACING * (0.5 + rng() * 1.0);
      }

      accumulated += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(car.position);

      if (!dog.chasing && dist < DETECT_RANGE) {
        dog.chasing = true;
        dog.heading = car.heading;
        if (!this.narratedThisSession) {
          narrate('dog.chase');
          this.narratedThisSession = true;
        }
      }

      if (dog.chasing) {
        if (dist > CHASE_RANGE) {
          // Give up and trot back toward home
          dog.chasing = false;
          const back = dog.home.clone().sub(dog.mesh.position).normalize();
          dog.mesh.position.addScaledVector(back, dt * (CHASE_SPEED * 0.4));
          dog.mesh.rotation.y = Math.atan2(-back.x, -back.z);
        } else {
          // Chase the car
          const towardCar = car.position.clone().sub(dog.mesh.position);
          towardCar.y = 0;
          const len = towardCar.length();
          if (len > 0.1) towardCar.divideScalar(len);
          const speed = Math.min(CHASE_SPEED, Math.abs(car.speed) * 0.7 + 2);
          dog.mesh.position.addScaledVector(towardCar, dt * speed);
          dog.mesh.position.y = 0;
          dog.mesh.rotation.y = Math.atan2(-towardCar.x, -towardCar.z);
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
