import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Town road segments where dogs appear — Kingston, Linstead, Ocho Rios areas.
const TOWN_PATTERNS = [
  'Windward Road', 'Mountain View', 'Stanton Terrace', 'Fairway Avenue',
  'Trafalgar Road', 'Hope Road', 'Hagley Park Road', 'Spanish Town Road',
  'Main Road', "King's Street", 'DaCosta Drive', 'Ocho Rios',
];

const CHASE_RADIUS = 16;
const GIVE_UP_RANGE = 35;
const CHASE_SPEED = 8;     // m/s — city dogs are fast
const CHASE_DURATION = 5;  // seconds before the dog gives up
const MIN_DOG_GAP = 720;   // compressed-world meters between spawn points

interface DogEntry {
  mesh: THREE.Group;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  timer: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogEntry[] = [];
  private narratorFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    // Build a point-index → segment-name lookup from the road segments array.
    const segName: string[] = new Array(road.points.length).fill('');
    for (const seg of road.segments) {
      for (let i = seg.from; i < seg.to; i++) segName[i] = seg.name;
    }

    let nextAt = 150;
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const inTown = TOWN_PATTERNS.some((p) => segName[i].includes(p));
      if (!inTown) {
        travelled += road.points[i - 1].distanceTo(road.points[i]);
        continue;
      }

      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Place on LEFT roadside (left-hand traffic rule)
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(5.5 + rng() * 2.5);
        const pos = a.clone().lerp(b, t).add(lateral);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(-dir.x, -dir.z) + (rng() - 0.5) * 0.8;
        this.object.add(mesh);
        this.dogs.push({ mesh, home: pos.clone(), pos: pos.clone(), chasing: false, timer: 0 });
        nextAt += MIN_DOG_GAP + rng() * MIN_DOG_GAP;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const dist = dog.pos.distanceTo(car.position);

      if (!dog.chasing && dist < CHASE_RADIUS) {
        dog.chasing = true;
        dog.timer = CHASE_DURATION;
        if (!this.narratorFired) {
          this.narratorFired = true;
          narrate('dog.chase');
        }
      }

      if (!dog.chasing) continue;

      dog.timer -= dt;
      const tooFar = dog.pos.distanceTo(dog.home) > GIVE_UP_RANGE;
      if (dog.timer <= 0 || tooFar) {
        dog.chasing = false;
        dog.pos.copy(dog.home);
        dog.mesh.position.copy(dog.home);
      } else {
        const dir = new THREE.Vector3().subVectors(car.position, dog.pos);
        dir.y = 0;
        dir.normalize();
        dog.pos.addScaledVector(dir, CHASE_SPEED * dt);
        dog.mesh.position.copy(dog.pos);
        dog.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
      }
    }
  }

  get count(): number {
    return this.dogs.length;
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
