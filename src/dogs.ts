import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// City dogs in Kingston famously look both ways before crossing (GAME_SPEC).
// Dogs wait on the roadside in town segments; when the car passes within
// CHASE_RADIUS they give chase. Narrator fires once per session.

const TOWN_SEGMENTS = new Set([
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Wellington Street',
  "King's Street",
  'Main Road',
]);

const CHASE_RADIUS = 18;   // m — dog spots the car and starts running
const GIVE_UP_RADIUS = 70; // m — dog abandons the chase
const CHASE_SPEED = 8.5;   // m/s — fast enough to keep up at low town speed
const DOG_SPACING = 80;    // min meters between dogs along a segment

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogAgent[] = [];
  private hasNarratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9901);
    const pts = road.points;

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;
      let distSinceLast = DOG_SPACING * rng();
      for (let i = seg.from + 1; i < seg.to; i++) {
        const step = pts[i - 1].distanceTo(pts[i]);
        distSinceLast += step;
        if (distSinceLast < DOG_SPACING) continue;
        distSinceLast = 0;

        const dir = pts[i].clone().sub(pts[i - 1]).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const side = rng() > 0.5 ? 1 : -1;
        const spawn = pts[i].clone().addScaledVector(perp, side * (5 + rng() * 4));
        spawn.y = 0;

        const mesh = makeDog();
        mesh.position.copy(spawn);
        this.object.add(mesh);
        this.dogs.push({ mesh, chasing: false });
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(carPos);

      if (!dog.chasing && dist < CHASE_RADIUS) {
        dog.chasing = true;
        if (!this.hasNarratedThisSession) {
          this.hasNarratedThisSession = true;
          narrate('dog.chase');
        }
      }

      if (dog.chasing) {
        if (dist > GIVE_UP_RADIUS) {
          dog.chasing = false;
        } else {
          const toward = carPos.clone().sub(dog.mesh.position).setY(0);
          const len = toward.length();
          if (len > 0.01) {
            toward.divideScalar(len);
            dog.mesh.position.addScaledVector(toward, CHASE_SPEED * dt);
            dog.mesh.position.y = 0;
            dog.mesh.rotation.y = Math.atan2(-toward.x, -toward.z);
          }
        }
      }
    }
  }
}

interface DogAgent {
  mesh: THREE.Group;
  chasing: boolean;
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
