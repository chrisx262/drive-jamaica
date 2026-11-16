import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Dog chase mechanic. Dogs are scattered roadside in town/city segments.
// When the car passes within CHASE_TRIGGER metres the dog gives chase.
// One narrator line fires per session on the first chase.
//
// Public API matches the potholes.ts pattern: construct with road, call
// update(car, dt) each frame, add .object to the scene.

const SPAWN_SIDE_MIN = 3.5;    // metres off road edge
const SPAWN_SIDE_MAX = 7;
const CHASE_TRIGGER = 14;      // metres; car enters this → dog gives chase
const CHASE_SPEED = 7.5;       // m/s
const GIVE_UP_DIST = CHASE_TRIGGER * 2.8; // dog gives up when this far away
const GIVE_UP_MS = 7000;       // ms max chase duration

// Town/city segments where dogs roam (matched by substring of segment name)
const TOWN_SEGMENTS = [
  'Windward Road',
  'Mountain View',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Main Road',
  'Church Road',
  'King',
  'Linstead',
];

// Space dogs ~60-150 m apart within each town segment
const DOG_GAP_MIN = 60;
const DOG_GAP_MAX = 150;

interface DogState {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  giveUpAt: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratorFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(5050);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.some((t) => seg.name.includes(t))) continue;

      let travelled = 0;
      let nextAt = DOG_GAP_MIN * rng(); // randomise first placement within segment

      for (let i = seg.from + 1; i < seg.to && i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const edgeLen = a.distanceTo(b);

        while (travelled + edgeLen > nextAt) {
          const t = (nextAt - travelled) / edgeLen;
          const dir = b.clone().sub(a).normalize();
          const side = rng() < 0.5 ? 1 : -1;
          const perp = new THREE.Vector3(-dir.z, 0, dir.x)
            .multiplyScalar((SPAWN_SIDE_MIN + rng() * (SPAWN_SIDE_MAX - SPAWN_SIDE_MIN)) * side);
          const pos = a.clone().lerp(b, t).add(perp);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          mesh.rotation.y = rng() * Math.PI * 2;
          this.object.add(mesh);
          this.dogs.push({ mesh, home: pos.clone(), pos: pos.clone(), chasing: false, giveUpAt: 0 });

          nextAt += DOG_GAP_MIN + rng() * (DOG_GAP_MAX - DOG_GAP_MIN);
        }
        travelled += edgeLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    for (const dog of this.dogs) {
      const dist = dog.pos.distanceTo(car.position);

      if (!dog.chasing && dist < CHASE_TRIGGER) {
        dog.chasing = true;
        dog.giveUpAt = now + GIVE_UP_MS;
        if (!this.narratorFired) {
          this.narratorFired = true;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        if (now > dog.giveUpAt || dist > GIVE_UP_DIST) {
          dog.chasing = false;
          // Trot back toward home
          dog.pos.lerp(dog.home, Math.min(0.5 * dt, 1));
          dog.mesh.position.copy(dog.pos);
        } else {
          const dir = car.position.clone().sub(dog.pos);
          dir.y = 0;
          dir.normalize();
          dog.pos.addScaledVector(dir, CHASE_SPEED * dt);
          dog.pos.y = 0;
          dog.mesh.position.copy(dog.pos);
          dog.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
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
