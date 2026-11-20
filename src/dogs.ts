import * as THREE from 'three';
import { makeDog } from './animals';
import { narrate } from './narrator';
import type { RoadLike } from './road';
import type { Car } from './car';

const CHASE_RANGE = 12;      // meters — car must be within this to trigger a chase
const CHASE_SPEED = 5.5;     // m/s — fast enough to feel threatening at low speeds
const BARK_INTERVAL = 1200;  // ms between bark shakes
const DOG_LATERAL = 3.8;     // meters off road centre — dogs wait at the kerb
const MIN_GAP = 180;         // minimum spacing between dog spawn points
const MAX_GAP = 600;

// Towns on the route where dogs congregate. Segments are matched by name substring.
const TOWN_SEGMENTS = [
  'Windward Road',
  'Mountain View',
  'Hagley Park',
  'Spanish Town Road',
  'Bog Walk',
  'Linstead',
  'Moneague',
];

interface DogInstance {
  obj: THREE.Group;
  spawnPos: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  barkTimer: number;
}

// Dogs appear in towns and chase the car when it comes within range.
// First chase per session triggers a narrator line.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private narratedOnce = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9731);

    // Build a set of point indices that belong to town segments.
    const townSet = new Set<number>();
    for (const seg of road.segments) {
      if (TOWN_SEGMENTS.some((t) => seg.name.includes(t))) {
        for (let i = seg.from; i <= seg.to && i < road.points.length; i++) {
          townSet.add(i);
        }
      }
    }

    // Walk the route; place one dog per gap, but only inside town ranges.
    let nextAt = MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      if (!townSet.has(i)) { travelled += road.points[i - 1].distanceTo(road.points[i]); continue; }
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        const side = rng() < 0.5 ? 1 : -1;
        const perp = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * DOG_LATERAL);
        const spawn = a.clone().lerp(b, t).add(perp);
        spawn.y = 0;

        const obj = makeDog();
        obj.position.copy(spawn);
        // Face toward the road centre
        obj.rotation.y = Math.atan2(perp.x, perp.z) + Math.PI;
        this.object.add(obj);
        this.dogs.push({ obj, spawnPos: spawn.clone(), pos: spawn.clone(), chasing: false, barkTimer: 0 });

        nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    const carSpeed = Math.abs(car.speed);

    for (const dog of this.dogs) {
      const dist = dog.pos.distanceTo(carPos);

      if (!dog.chasing) {
        if (dist < CHASE_RANGE) {
          dog.chasing = true;
          if (!this.narratedOnce) {
            narrate('dog.chase');
            this.narratedOnce = true;
          }
        }
      }

      if (dog.chasing) {
        // Chase the car; give up once the car is well away or dog is far from spawn.
        const spawnDist = dog.pos.distanceTo(dog.spawnPos);
        if (dist > CHASE_RANGE * 3.5 || spawnDist > 60) {
          // Return to spawn
          const toSpawn = dog.spawnPos.clone().sub(dog.pos);
          const toSpawnLen = toSpawn.length();
          if (toSpawnLen < 0.5) {
            dog.pos.copy(dog.spawnPos);
            dog.chasing = false;
          } else {
            dog.pos.addScaledVector(toSpawn.normalize(), Math.min(CHASE_SPEED * dt, toSpawnLen));
          }
          dog.obj.position.copy(dog.pos);
          return;
        }

        // Move toward the car
        const toCar = carPos.clone().sub(dog.pos);
        const toCarLen = toCar.length();
        if (toCarLen > 0.1) {
          const moveStep = Math.min(CHASE_SPEED * dt, toCarLen);
          dog.pos.addScaledVector(toCar.normalize(), moveStep);
          dog.obj.position.copy(dog.pos);
          dog.obj.rotation.y = Math.atan2(toCar.x, toCar.z);
        }

        // Bark shake — oscillate the dog's y position
        dog.barkTimer += dt * 1000;
        if (dog.barkTimer > BARK_INTERVAL) dog.barkTimer = 0;
        const barkPhase = (dog.barkTimer / BARK_INTERVAL) * Math.PI * 2;
        dog.obj.position.y = Math.abs(Math.sin(barkPhase * 4)) * 0.12;

        // Slow the car slightly if the dog gets right on top (city dog harassment)
        if (dist < 2.5 && carSpeed > 2) {
          // Cosmetic only — no speed mutation (owner tunes physics)
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
