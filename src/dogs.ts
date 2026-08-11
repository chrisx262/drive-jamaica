import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const SPACING_MIN = 160; // m between dogs (compressed world)
const SPACING_RAND = 120;
const CHASE_RANGE = 22; // m — dog detects car and starts chasing
const STOP_RANGE = 55; // m — dog gives up the chase
const CHASE_SPEED = 6.5; // m/s

// Town road segments where dogs live (verified against data/route.json).
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Stanton Terrace',
  'Fairway Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Eastwood Park Road',
  'South Odeon Avenue',
  'Bus Lane',
  'Nelson Mandela Highway',
  'Spanish Town Road',
  'Wellington Street',
  'Linstead Bypass',
  'Church Road',
  'Main Road',
  "King's Street",
]);

interface DogState {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  chasing: boolean;
}

// Dogs appear on town segments. When the car passes within CHASE_RANGE they
// give chase and bark. Narrator fires on the first chase of the session only.
export class Dogs {
  readonly object: THREE.Group;
  private readonly dogs: DogState[] = [];
  private chaseNarratedOnce = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);
    const pts = road.points;

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;

      let distInSeg = 0;
      let nextAt = SPACING_MIN * 0.25 + rng() * SPACING_RAND;

      for (let i = seg.from; i < seg.to - 1 && i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const step = a.distanceTo(b);

        while (distInSeg + step >= nextAt) {
          const t = (nextAt - distInSeg) / step;
          const fwd = b.clone().sub(a).normalize();
          // Left perpendicular (left-hand traffic): left = +perp
          const perp = new THREE.Vector3(-fwd.z, 0, fwd.x);
          const lateral = perp.clone().multiplyScalar(4.5 + rng() * 2.5);
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          mesh.rotation.y = rng() * Math.PI * 2;
          this.object.add(mesh);
          this.dogs.push({ mesh, pos: pos.clone(), chasing: false });

          nextAt += SPACING_MIN + rng() * SPACING_RAND;
        }
        distInSeg += step;
      }
    }
  }

  update(dt: number, car: Car): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dist = dog.pos.distanceTo(carPos);

      if (!dog.chasing && dist < CHASE_RANGE) {
        dog.chasing = true;
        if (!this.chaseNarratedOnce) {
          this.chaseNarratedOnce = true;
          narrate('dog.chase');
        }
      } else if (dog.chasing && dist > STOP_RANGE) {
        dog.chasing = false;
      }

      if (dog.chasing) {
        const toward = carPos.clone().sub(dog.pos).setY(0);
        const len = toward.length();
        if (len > 0.1) {
          toward.divideScalar(len);
          dog.pos.addScaledVector(toward, CHASE_SPEED * dt);
          dog.pos.y = 0;
          dog.mesh.position.copy(dog.pos);
          dog.mesh.rotation.y = Math.atan2(-toward.x, -toward.z);
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
