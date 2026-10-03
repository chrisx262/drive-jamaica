import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_TRIGGER_RADIUS = 18; // m — car this close → dog activates
const GIVE_UP_RADIUS = 40;       // m — dog gives up once car escapes
const CHASE_SPEED = 5.5;         // m/s
const DOGS_PER_SEGMENT = 3;

// Town and city segments where dogs roam. Not the Palisadoes airport road.
const DOG_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Nelson Mandela Highway',
  'Linstead Bypass',
  'Church Road',
  'Main Road',
  'Moneague - Golden Grove Road',
  'DaCosta Drive',
]);

interface DogInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  active: boolean;
  spent: boolean; // already completed one chase this session
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private narratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(3737);

    for (const seg of road.segments) {
      if (!DOG_SEGMENTS.has(seg.name)) continue;
      const span = seg.to - seg.from;

      for (let i = 0; i < DOGS_PER_SEGMENT; i++) {
        const t = (i + 0.25 + rng() * 0.5) / DOGS_PER_SEGMENT;
        const ptIdx = seg.from + Math.floor(t * span);
        if (ptIdx >= road.points.length - 1) continue;

        const pt = road.points[ptIdx];
        const next = road.points[Math.min(ptIdx + 1, road.points.length - 1)];
        const dir = next.clone().sub(pt).normalize();
        const side = (rng() < 0.5 ? 1 : -1) * (3.5 + rng() * 3.5);
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side);
        const spawnPos = pt.clone().add(lateral);
        spawnPos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(spawnPos);
        mesh.scale.setScalar(0.8 + rng() * 0.3);
        this.object.add(mesh);

        this.dogs.push({ mesh, pos: spawnPos.clone(), active: false, spent: false });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      if (dog.spent) continue;

      const dist = dog.pos.distanceTo(car.position);

      if (!dog.active && dist < CHASE_TRIGGER_RADIUS) {
        dog.active = true;
        if (!this.narratedThisSession) {
          this.narratedThisSession = true;
          narrate('dog.chase');
        }
      }

      if (!dog.active) continue;

      if (dist > GIVE_UP_RADIUS) {
        dog.active = false;
        dog.spent = true;
        continue;
      }

      // Chase toward car
      const towardCar = car.position.clone().sub(dog.pos).setY(0);
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

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
