import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Town segments where dogs appear — famously bold in Kingston.
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Main Road',
  "King's Street",
]);

const TRIGGER_RANGE = 28;   // m — dog wakes up and starts chasing
const CHASE_SPEED   = 5.5;  // m/s — brisk dog trot
const GIVE_UP_DIST  = 90;   // m — dog abandons chase
const DOG_SPACING   = 145;  // m between dogs along town stretches

interface DogState {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  chasing: boolean;
}

// Dogs scattered along town road segments. First chase fires one narrator line
// per session; subsequent chases are silent to avoid repetition.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    const townIdx = new Set<number>();
    for (const seg of road.segments) {
      if (TOWN_SEGMENTS.has(seg.name)) {
        for (let i = seg.from; i < seg.to; i++) townIdx.add(i);
      }
    }

    let townDist = 0;
    let nextAt = DOG_SPACING / 2;

    for (let i = 1; i < road.points.length; i++) {
      if (!townIdx.has(i - 1)) continue;
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (townDist + segLen >= nextAt) {
        const t = (nextAt - townDist) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Place dogs on the pavement / verge, left or right at random
        const side = rng() > 0.5 ? 1 : -1;
        const perp = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (5.5 + rng() * 3));
        const pos = a.clone().lerp(b, t).add(perp);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);
        this.dogs.push({ mesh, pos: pos.clone(), chasing: false });
        nextAt += DOG_SPACING * (0.7 + rng() * 0.6);
      }
      townDist += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dx = carPos.x - dog.pos.x;
      const dz = carPos.z - dog.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (!dog.chasing && dist < TRIGGER_RANGE) {
        dog.chasing = true;
        if (!this.narrated) {
          this.narrated = true;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        if (dist > GIVE_UP_DIST) {
          dog.chasing = false;
        } else if (dist > 0.1) {
          const ux = dx / dist;
          const uz = dz / dist;
          const step = Math.min(CHASE_SPEED * dt, dist);
          dog.pos.x += ux * step;
          dog.pos.z += uz * step;
          dog.mesh.position.copy(dog.pos);
          // Face the car (Three.js convention: rotation.y = atan2(-fwdX, -fwdZ))
          dog.mesh.rotation.y = Math.atan2(-ux, -uz);
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
