import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Town segments where dogs appear (city dogs in Kingston famously look both ways).
// Palisadoes is excluded — no stray dogs on the showcase airport strip.
const DOG_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Spanish Town Road',
  'Main Road',        // Linstead town centre
  'King\'s Street',   // Linstead
  'Church Road',      // Linstead
]);

const CHASE_RADIUS = 14;     // metres — dog starts chasing at this distance
const BARK_RADIUS = 22;      // metres — dog turns to face car (alert pose)
const CHASE_SPEED = 7.5;     // m/s (dog is fast but car wins above ~27 km/h)
const DOGS_PER_SEGMENT_KM = 1.8; // approximate density in town stretches

export class Dogs {
  readonly object: THREE.Group;

  private dogs: {
    mesh: THREE.Group;
    pos: THREE.Vector3;
    dir: THREE.Vector3;  // current facing direction
    chasing: boolean;
  }[] = [];

  private narratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9371);

    for (const seg of road.segments) {
      if (!DOG_SEGMENTS.has(seg.name)) continue;

      const pts = road.points.slice(seg.from, seg.to + 1);
      // Measure segment length
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += pts[i - 1].distanceTo(pts[i]);

      const count = Math.max(1, Math.round(len * DOGS_PER_SEGMENT_KM / 1000));
      for (let k = 0; k < count; k++) {
        const t = rng();
        // Walk along segment polyline to find the world position at t*len
        let walked = 0;
        const target = t * len;
        let worldPos = pts[0].clone();
        let segDir = new THREE.Vector3(0, 0, 1);
        for (let i = 1; i < pts.length; i++) {
          const d = pts[i - 1].distanceTo(pts[i]);
          if (walked + d >= target) {
            const frac = (target - walked) / d;
            worldPos = pts[i - 1].clone().lerp(pts[i], frac);
            segDir = pts[i].clone().sub(pts[i - 1]).normalize();
            break;
          }
          walked += d;
        }

        // Offset to roadside (5–9 m to one side)
        const side = rng() > 0.5 ? 1 : -1;
        const lateralDist = 5 + rng() * 4;
        const perp = new THREE.Vector3(-segDir.z, 0, segDir.x).multiplyScalar(side * lateralDist);
        worldPos.add(perp);
        worldPos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(worldPos);
        // Face toward road initially
        mesh.rotation.y = Math.atan2(-perp.x, -perp.z) + Math.PI;
        this.object.add(mesh);

        this.dogs.push({
          mesh,
          pos: worldPos.clone(),
          dir: segDir.clone(),
          chasing: false,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const distSq = dog.pos.distanceToSquared(carPos);

      if (distSq > BARK_RADIUS * BARK_RADIUS) {
        if (dog.chasing) dog.chasing = false;
        continue;
      }

      if (distSq < CHASE_RADIUS * CHASE_RADIUS) {
        // Chase: move toward car
        const towardCar = carPos.clone().sub(dog.pos);
        towardCar.y = 0;
        if (towardCar.lengthSq() > 0.001) {
          towardCar.normalize();
          dog.dir.copy(towardCar);
          dog.pos.addScaledVector(towardCar, CHASE_SPEED * dt);
          dog.mesh.position.copy(dog.pos);
          dog.mesh.rotation.y = Math.atan2(towardCar.x, towardCar.z);
        }

        if (!dog.chasing) {
          dog.chasing = true;
          if (!this.narratedThisSession) {
            this.narratedThisSession = true;
            narrate('dog.chase');
          }
        }
      } else {
        // Bark: turn to face car but don't move
        const towardCar = carPos.clone().sub(dog.pos);
        towardCar.y = 0;
        if (towardCar.lengthSq() > 0.001) {
          towardCar.normalize();
          dog.mesh.rotation.y = Math.atan2(towardCar.x, towardCar.z);
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
