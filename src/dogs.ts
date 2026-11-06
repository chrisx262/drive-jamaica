import * as THREE from 'three';
import { makeDog } from './animals';
import { narrate } from './narrator';
import type { Car } from './car';
import type { RoadLike } from './road';

const CHASE_RADIUS = 18;
const GIVE_UP_AFTER = 4500; // ms
const DOG_SPEED = 7; // m/s

// Town/urban segments where dogs roam (city dogs famously look both ways)
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Main Road',
  "King's Street",
]);

interface DogState {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  chasing: boolean;
  chaseStart: number;
}

// Dogs appear in towns; a dog chases the car when it passes within range.
// Narrator fires on the first chase per session (data/narrator.json: dog.chase).
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private chaseTriggered = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;

      let dist = 0;
      let nextAt = 55 + rng() * 70;

      for (let i = seg.from + 1; i < seg.to && i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const len = a.distanceTo(b);

        while (dist + len >= nextAt) {
          const t = (nextAt - dist) / len;
          const dir = b.clone().sub(a).normalize();
          const side = rng() > 0.5 ? 1 : -1;
          const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (5.5 + rng() * 3.5));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.random() * Math.PI * 2;
          this.object.add(mesh);
          this.dogs.push({ mesh, home: pos.clone(), chasing: false, chaseStart: 0 });

          nextAt += 55 + rng() * 100;
        }
        dist += len;
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    const carPos = car.position;

    for (const dog of this.dogs) {
      if (dog.chasing) {
        if (now - dog.chaseStart > GIVE_UP_AFTER) {
          dog.chasing = false;
          dog.mesh.position.copy(dog.home);
          continue;
        }
        const tocar = carPos.clone().sub(dog.mesh.position);
        const dist = tocar.length();
        if (dist < 1.8) continue;
        tocar.normalize();
        dog.mesh.position.addScaledVector(tocar, Math.min(DOG_SPEED * dt, dist - 1.5));
        dog.mesh.rotation.y = Math.atan2(tocar.x, tocar.z);
      } else {
        if (dog.mesh.position.distanceToSquared(carPos) < CHASE_RADIUS * CHASE_RADIUS) {
          dog.chasing = true;
          dog.chaseStart = now;
          if (!this.chaseTriggered) {
            this.chaseTriggered = true;
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
