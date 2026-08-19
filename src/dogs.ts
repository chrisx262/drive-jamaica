import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs appear in towns and chase the car when it passes close enough.
// City dogs in Kingston famously look both ways before crossing — that
// personality detail is noted for a future animation pass.

const CHASE_RADIUS = 22;   // m — enter this to trigger the chase
const GIVE_UP_DIST = 60;   // m — dog gives up if car gets this far away
const DOG_SPEED = 7.5;     // m/s
const LATERAL_MAX = 9;     // m — how far off road center dogs can start

// Point-index ranges [from, to) in road.points that are urban town zones.
// Corresponds to: Harbour View → Mountain View (Kingston), Hope Rd → Hagley Park,
// and the Linstead town streets.
const TOWN_RANGES: [number, number][] = [
  [38, 92],   // Kingston approach — Harbour View, Windward Rd, Mountain View Ave
  [103, 130], // Half Way Tree area — Hope Rd / Hagley Park Rd
  [342, 390], // Linstead — Church Rd, Main Rd, King's Street
];

interface DogState {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  chasing: boolean;
  done: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private firstChaseNarrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const [from, to] of TOWN_RANGES) {
      let travelled = 0;
      let nextAt = 30 + rng() * 50;
      for (let i = from + 1; i < Math.min(to, road.points.length); i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);
        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          const perp = new THREE.Vector3(dir.z, 0, -dir.x);
          const side = rng() < 0.55 ? 1 : -1; // slightly favour roadside buildings
          const lateralDist = 3.5 + rng() * LATERAL_MAX;
          const pos = a.clone().lerp(b, t).addScaledVector(perp, lateralDist * side);
          pos.y = 0;

          const obj = makeDog();
          obj.position.copy(pos);
          obj.rotation.y = rng() * Math.PI * 2;
          this.object.add(obj);
          this.dogs.push({ obj, pos: pos.clone(), chasing: false, done: false });

          nextAt += 40 + rng() * 70;
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      if (dog.done) continue;
      const dist = dog.pos.distanceTo(carPos);
      if (!dog.chasing) {
        if (dist < CHASE_RADIUS) {
          dog.chasing = true;
          if (!this.firstChaseNarrated) {
            this.firstChaseNarrated = true;
            narrate('dog.chase');
          }
        }
        continue;
      }
      if (dist > GIVE_UP_DIST) {
        dog.chasing = false;
        dog.done = true;
        continue;
      }
      const dir = carPos.clone().sub(dog.pos).setY(0);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        dog.pos.addScaledVector(dir, DOG_SPEED * dt);
        dog.obj.position.copy(dog.pos);
        dog.obj.rotation.y = Math.atan2(dir.x, dir.z);
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
