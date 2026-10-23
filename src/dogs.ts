import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const DETECT_RADIUS = 22;   // meters — dog notices the car
const CHASE_RADIUS = 40;    // meters — dog gives up the chase
const GIVE_UP_TIME = 6000;  // ms before the dog trots back to spawn
const DOG_SPEED = 8;        // m/s — manageable but nippy

// Dogs spawn in town stretches (Kingston, Half Way Tree, Bog Walk, Linstead,
// Moneague, Ocho Rios). Route fraction ranges approximate these stretches;
// owner can tune via the data layer if placements need shifting.
// Expressed as fractions of total point count (0–1).
const TOWN_RANGES: [number, number][] = [
  [0.18, 0.42],  // Kingston through Half Way Tree
  [0.54, 0.60],  // Bog Walk
  [0.60, 0.68],  // Linstead
  [0.72, 0.78],  // Moneague
  [0.92, 1.00],  // Ocho Rios
];

const DOGS_PER_RANGE_KM = 1.6; // average dogs per world-km in town ranges

interface DogInstance {
  mesh: THREE.Group;
  spawn: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  giveUpTimer: ReturnType<typeof setTimeout> | undefined;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private firstChase = true;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(3001);

    const total = road.points.length;
    for (const [fStart, fEnd] of TOWN_RANGES) {
      const iStart = Math.floor(fStart * total);
      const iEnd = Math.min(Math.floor(fEnd * total), total - 2);

      // Measure the world-space length of this stretch.
      let stretchLen = 0;
      for (let i = iStart + 1; i <= iEnd; i++) {
        stretchLen += road.points[i - 1].distanceTo(road.points[i]);
      }

      const count = Math.max(1, Math.round(stretchLen / 1000 * DOGS_PER_RANGE_KM));
      for (let d = 0; d < count; d++) {
        // Pick a random point index inside this stretch.
        const idx = iStart + Math.floor(rng() * (iEnd - iStart));
        const pt = road.points[idx];
        const dir = road.points[Math.min(idx + 1, total - 1)].clone().sub(pt).normalize();
        // Lateral offset: roadside (4–9 m off centre), alternating sides.
        const side = d % 2 === 0 ? 1 : -1;
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (4 + rng() * 5));
        const spawnPos = pt.clone().add(lateral);
        spawnPos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(spawnPos);
        // Dogs face away from the road initially.
        mesh.rotation.y = Math.atan2(lateral.x, lateral.z);
        this.object.add(mesh);

        this.dogs.push({
          mesh,
          spawn: spawnPos.clone(),
          pos: spawnPos.clone(),
          chasing: false,
          giveUpTimer: undefined,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dist = dog.pos.distanceTo(carPos);

      if (!dog.chasing && dist < DETECT_RADIUS) {
        dog.chasing = true;
        clearTimeout(dog.giveUpTimer);
        if (this.firstChase) {
          this.firstChase = false;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        if (dist > CHASE_RADIUS) {
          // Give up and trot back after a moment.
          dog.chasing = false;
          clearTimeout(dog.giveUpTimer);
          dog.giveUpTimer = setTimeout(() => {
            dog.pos.copy(dog.spawn);
            dog.mesh.position.copy(dog.spawn);
          }, GIVE_UP_TIME);
        } else {
          // Chase: move toward car.
          const dir = carPos.clone().sub(dog.pos).setY(0);
          const len = dir.length();
          if (len > 0.1) {
            dir.divideScalar(len);
            dog.pos.addScaledVector(dir, Math.min(DOG_SPEED * dt, len));
            dog.mesh.position.copy(dog.pos);
            dog.mesh.rotation.y = Math.atan2(dir.x, dir.z);
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
