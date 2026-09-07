import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const CHASE_RANGE = 22;      // meters: car enters this radius → dog starts chasing
const GIVE_UP_RANGE = 45;    // meters: dog stops once the car is this far ahead
const DOG_SPEED = 7.5;       // m/s — a fast Jamaican yard dog
const SPAWN_LATERAL = 4.5;   // how far off the road edge to spawn

// Town segments by partial name match — dogs live in built-up areas, not countryside.
const TOWN_SEGMENTS = [
  'Windward', 'Kingston', 'Half Way', 'Spanish Town',
  'Linstead', 'Moneague', 'Ocho Rios',
];

function isTownSegment(name: string): boolean {
  return TOWN_SEGMENTS.some((t) => name.toLowerCase().includes(t.toLowerCase()));
}

interface DogInstance {
  object: THREE.Object3D;
  home: THREE.Vector3;   // original spawn position
  pos: THREE.Vector3;    // current position (mutable)
  chasing: boolean;
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

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private chaseNarratedThisSession = false;

  constructor(road: RoadLike) {
    const rng = mulberry32(2027);
    this.object = new THREE.Group();

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !isTownSegment(seg.name)) continue;

      // Sparse placement — roughly one dog per ~60–120 m of town road.
      if (rng() > 0.025) continue;

      const a = road.points[i - 1];
      const b = road.points[i];
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector3(dir.z, 0, -dir.x);

      // LEFT side of road only — dogs hang in the verge, not on-coming traffic side.
      const t = rng();
      const spawn = a.clone().lerp(b, t).addScaledVector(perp, SPAWN_LATERAL + rng() * 2);
      spawn.y = 0;

      const mesh = makeDog();
      mesh.position.copy(spawn);
      // Face the road (roughly towards the road center).
      mesh.rotation.y = Math.atan2(-perp.x, -perp.z);
      this.object.add(mesh);

      this.dogs.push({ object: mesh, home: spawn.clone(), pos: spawn.clone(), chasing: false });
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const toCarDist = dog.pos.distanceTo(car.position);

      if (!dog.chasing && toCarDist < CHASE_RANGE) {
        dog.chasing = true;
        if (!this.chaseNarratedThisSession) {
          this.chaseNarratedThisSession = true;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        if (toCarDist > GIVE_UP_RANGE) {
          // Dog gives up — trot back home.
          dog.chasing = false;
        } else {
          // Move toward the car.
          const step = dog.pos.clone().sub(car.position).normalize().multiplyScalar(-DOG_SPEED * dt);
          dog.pos.add(step);
          dog.object.position.copy(dog.pos);
          // Face the car.
          const dx = car.position.x - dog.pos.x;
          const dz = car.position.z - dog.pos.z;
          dog.object.rotation.y = Math.atan2(dx, dz);
        }
      } else {
        // Return home slowly when not chasing.
        if (dog.pos.distanceTo(dog.home) > 0.1) {
          const step = dog.home.clone().sub(dog.pos).normalize().multiplyScalar(1.5 * dt);
          dog.pos.add(step);
          dog.object.position.copy(dog.pos);
        }
      }
    }
  }
}
