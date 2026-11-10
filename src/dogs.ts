import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs appear in town and suburban sections; city dogs famously look both ways (see GAME_SPEC).
// When the car passes within DETECT_RADIUS, the dog breaks into a chase.
// First chase per session fires the narrator; subsequent ones are silent.

const DETECT_RADIUS = 12; // m — dog spots the car
const GIVE_UP_RADIUS = 32; // m — dog abandons chase
const CHASE_SPEED = 7; // m/s

const DOG_ZONE_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Church Road',
  'Main Road',
  "King's Street",
  'Linstead Bypass',
]);

interface DogState {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  state: 'idle' | 'chase' | 'done';
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const seg of road.segments) {
      if (!DOG_ZONE_SEGMENTS.has(seg.name)) continue;
      const ptCount = seg.to - seg.from;
      // 1–3 dogs per zone segment, spaced by route-point thirds
      const dogCount = Math.min(3, Math.max(1, Math.floor(ptCount / 6)));
      for (let i = 0; i < dogCount; i++) {
        const ptIdx = Math.min(
          seg.from + Math.floor(((i + 0.5 + (rng() - 0.5) * 0.6) / dogCount) * ptCount),
          road.points.length - 2,
        );
        const pt = road.points[ptIdx];
        const nextPt = road.points[ptIdx + 1];
        if (!pt || !nextPt) continue;

        const dir = nextPt.clone().sub(pt).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const side = rng() > 0.5 ? 1 : -1;
        // Spawn 5–8 m off the road edge — yard dog on the verge
        const pos = pt.clone().addScaledVector(perp, side * (5 + rng() * 3));
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
        this.object.add(mesh);
        this.dogs.push({ mesh, pos: pos.clone(), state: 'idle' });
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      if (dog.state === 'done') continue;

      const dist = dog.pos.distanceTo(carPos);

      if (dog.state === 'idle' && dist < DETECT_RADIUS) {
        dog.state = 'chase';
        if (!this.narrated) {
          this.narrated = true;
          narrate('dog.chase');
        }
      }

      if (dog.state === 'chase') {
        if (dist > GIVE_UP_RADIUS) {
          dog.state = 'done';
          continue;
        }
        const towardCar = carPos.clone().sub(dog.pos);
        const len = towardCar.length();
        if (len > 0.01) {
          towardCar.divideScalar(len);
          dog.pos.addScaledVector(towardCar, CHASE_SPEED * dt);
          dog.mesh.position.copy(dog.pos);
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
