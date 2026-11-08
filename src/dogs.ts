import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_RANGE = 14;    // world units before dog breaks into a run
const CHASE_DURATION = 4;  // seconds of chasing before dog gives up
const CHASE_SPEED = 7;     // m/s — fast enough to run alongside briefly
const MIN_GAP = 60;        // min world units between dogs along a town stretch

// Segments where dogs appear (towns and urban roads).
const TOWN_PATTERNS = [
  'Windward Road', 'Mountain View Avenue', 'Trafalgar Road',
  'Hagley Park Road', "King's Street", 'Main Road',
  'DaCosta Drive', 'Northern Coastal Highway', 'Nelson Mandela Highway',
  'Spanish Town Road',
];

interface DogState {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  chasing: boolean;
  chaseTimer: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private chaseNarrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    const townPts = new Set<number>();
    for (const seg of road.segments) {
      if (TOWN_PATTERNS.some((p) => seg.name.includes(p))) {
        for (let i = seg.from; i < seg.to; i++) townPts.add(i);
      }
    }

    let travelled = 0;
    let nextAt = MIN_GAP * (0.5 + rng() * 0.5);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      if (!townPts.has(i)) {
        travelled += segLen;
        continue;
      }

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        const side = rng() > 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (5 + rng() * 3));
        const pos = a.clone().lerp(b, t).add(lateral);
        pos.y = 0;

        const mesh = makeDog();
        // Face toward the road
        mesh.rotation.y = Math.atan2(lateral.x, lateral.z);
        mesh.position.copy(pos);
        this.object.add(mesh);
        this.dogs.push({ mesh, home: pos.clone(), chasing: false, chaseTimer: 0 });
        nextAt += MIN_GAP + rng() * MIN_GAP;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      if (dog.chasing) {
        dog.chaseTimer -= dt;
        if (dog.chaseTimer <= 0) {
          dog.chasing = false;
          dog.mesh.position.copy(dog.home);
          dog.mesh.rotation.y = Math.atan2(
            dog.home.x - car.position.x,
            dog.home.z - car.position.z,
          );
        } else {
          const tocar = new THREE.Vector3().subVectors(car.position, dog.mesh.position);
          tocar.y = 0;
          const dist = tocar.length();
          if (dist > 0.5) {
            tocar.normalize().multiplyScalar(Math.min(CHASE_SPEED * dt, dist));
            dog.mesh.position.add(tocar);
            dog.mesh.rotation.y = Math.atan2(-tocar.x, -tocar.z);
          }
        }
      } else if (dog.home.distanceTo(car.position) < CHASE_RANGE) {
        dog.chasing = true;
        dog.chaseTimer = CHASE_DURATION;
        if (!this.chaseNarrated) {
          this.chaseNarrated = true;
          narrate('dog.chase');
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
