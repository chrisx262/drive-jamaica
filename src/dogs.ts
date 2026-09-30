import * as THREE from 'three';
import type { Car } from './car';
import type { RoadLike } from './road';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_RADIUS = 14;   // metres — dog starts chasing when car enters this range
const CHASE_SPEED = 6.5;   // m/s — a determined Jamaican street dog
const CHASE_DURATION = 5500; // ms before dog gives up
const SPAWN_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Spanish Town Road',
  'Main Road',
  'Church Road',
  'King\'s Street',
  'Linstead Bypass',
]);

type DogState = 'idle' | 'chasing';

interface DogEntry {
  mesh: THREE.Object3D;
  origin: THREE.Vector3;
  state: DogState;
  chaseMs: number;
}

// Dogs: scattered through towns; chase the car when it passes within range.
// One narrator line fires on the first chase of the session.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogEntry[] = [];
  private firstChaseFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const seg of road.segments) {
      if (!SPAWN_SEGMENTS.has(seg.name)) continue;
      const segLen = seg.to - seg.from;
      const count = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < count; k++) {
        const i = seg.from + 1 + Math.floor(rng() * Math.max(1, segLen - 2));
        const ia = Math.max(0, i - 1);
        const ib = Math.min(road.points.length - 1, i + 1);
        const dir = road.points[ib].clone().sub(road.points[ia]).normalize();
        const side = rng() < 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (5 + rng() * 5));
        const origin = road.points[i].clone().add(lateral);
        origin.y = 0;

        const mesh = makeDog();
        mesh.position.copy(origin);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);
        this.dogs.push({ mesh, origin: origin.clone(), state: 'idle', chaseMs: 0 });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(car.position);

      if (dog.state === 'idle' && dist < CHASE_RADIUS) {
        dog.state = 'chasing';
        dog.chaseMs = CHASE_DURATION;
        if (!this.firstChaseFired) {
          this.firstChaseFired = true;
          narrate('dog.chase');
        }
      }

      if (dog.state === 'chasing') {
        dog.chaseMs -= dt * 1000;
        if (dog.chaseMs <= 0) {
          dog.state = 'idle';
          dog.mesh.position.copy(dog.origin);
        } else {
          const toward = car.position.clone().sub(dog.mesh.position);
          toward.y = 0;
          if (toward.length() > 0.1) {
            toward.normalize().multiplyScalar(CHASE_SPEED * dt);
            dog.mesh.position.add(toward);
            dog.mesh.rotation.y = Math.atan2(toward.x, toward.z);
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
