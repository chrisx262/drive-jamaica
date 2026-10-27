import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const TRIGGER_RADIUS = 18;   // world units — car must come within this to wake a dog
const CHASE_SPEED = 7;       // world units/s the dog runs
const CHASE_DURATION = 9;    // seconds before dog gives up
const DOGS_PER_TOWN_SEGMENT = 3;

// Segments where dogs appear (town/city stretches); matched by name substring.
const TOWN_SEGMENT_NAMES = [
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Main Road',          // Linstead
  "King's Street",      // Linstead
  'DaCosta Drive',      // Ocho Rios
  'Northern Coastal Highway',
];

interface DogInstance {
  object: THREE.Group;
  idlePos: THREE.Vector3;
  chasing: boolean;
  chaseTimer: number;
}

// Dog chase mechanic: deterministically placed in town sections.
// When the car enters TRIGGER_RADIUS, a dog gives chase until CHASE_DURATION expires.
// Narrator fires once per session on the first chase.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private narratorFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    const townSegments = road.segments.filter((s) =>
      TOWN_SEGMENT_NAMES.includes(s.name)
    );

    for (const seg of townSegments) {
      for (let d = 0; d < DOGS_PER_TOWN_SEGMENT; d++) {
        const t = rng();
        const idx = seg.from + Math.floor(t * (seg.to - seg.from - 1));
        const a = road.points[idx];
        const b = road.points[idx + 1] ?? a;
        const dir = b.clone().sub(a).normalize();
        // Place dog on the SIDE of the road (3–6 m off road centre, left or right)
        const side = rng() > 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (3.5 + rng() * 2.5));
        const pos = a.clone().add(lateral);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        // Face the road
        mesh.rotation.y = Math.atan2(dir.x, dir.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        this.object.add(mesh);
        this.dogs.push({ object: mesh, idlePos: pos.clone(), chasing: false, chaseTimer: 0 });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      if (dog.chasing) {
        dog.chaseTimer -= dt;
        if (dog.chaseTimer <= 0) {
          dog.chasing = false;
          dog.object.position.copy(dog.idlePos);
          continue;
        }
        // Run toward car's current position
        const tocar = car.position.clone().sub(dog.object.position);
        tocar.y = 0;
        const dist = tocar.length();
        if (dist > 0.5) {
          tocar.normalize().multiplyScalar(CHASE_SPEED * dt);
          dog.object.position.add(tocar);
          dog.object.rotation.y = Math.atan2(tocar.x, tocar.z);
        }
      } else {
        // Wake if car is close enough
        if (dog.object.position.distanceToSquared(car.position) < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          dog.chasing = true;
          dog.chaseTimer = CHASE_DURATION;
          if (!this.narratorFired) {
            this.narratorFired = true;
            narrate('dog.chase');
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
