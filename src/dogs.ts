import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const TRIGGER_RANGE = 28;  // meters — car enters this radius → dog gives chase
const ESCAPE_RANGE = 90;   // meters — dog gives up beyond this
const CHASE_SPEED = 7.5;   // m/s — dogs sprint fast but can't keep up forever
const MIN_SPACING = 110;   // min meters between dogs along town roads

// Segment names containing these keywords count as town/urban (dogs spawn here).
const TOWN_KEYWORDS = [
  'windward', 'mountain view', 'stanton', 'fairway',
  'trafalgar', 'hope road', 'hagley park', 'eastwood park',
  'south odeon', 'bus lane', 'spanish town road',
  'wellington', 'white church', "king's street",
  'church road', 'main road',
];

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DogState {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  chasing: boolean;
}

// Dog-chase mechanic: dogs appear beside town roads and chase the car when it
// passes within range. Narrator fires on the first chase per session. Each dog
// gives up once the car gets far enough away and trots back home.
export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private hasNarratedChase = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);
    let accumulated = 0;
    let nextAt = MIN_SPACING * (0.2 + rng() * 0.6);

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg) continue;
      const segNameLower = seg.name.toLowerCase();
      if (!TOWN_KEYWORDS.some((k) => segNameLower.includes(k))) continue;

      const a = road.points[i - 1];
      const b = road.points[i];
      const stepLen = a.distanceTo(b);
      accumulated += stepLen;

      while (accumulated >= nextAt) {
        const t = (nextAt - (accumulated - stepLen)) / stepLen;
        const dir = b.clone().sub(a).normalize();
        // Place dog beside the road — randomise left/right and offset from kerb
        const side = rng() > 0.5 ? 1 : -1;
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (5 + rng() * 3.5));
        const pos = a.clone().lerp(b, Math.min(Math.max(t, 0), 1)).add(perp);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        // Face toward the road from the kerb (idle stance)
        const idleFacing = new THREE.Vector3(-perp.x, 0, -perp.z).normalize();
        mesh.rotation.y = Math.atan2(-idleFacing.x, -idleFacing.z);

        this.object.add(mesh);
        this.dogs.push({ mesh, home: pos.clone(), chasing: false });

        nextAt += MIN_SPACING * (0.5 + rng() * 1.0);
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(car.position);

      if (!dog.chasing) {
        if (dist < TRIGGER_RANGE) {
          dog.chasing = true;
          if (!this.hasNarratedChase) {
            this.hasNarratedChase = true;
            narrate('dog.chase');
          }
        }
        continue;
      }

      // Chasing
      if (dist > ESCAPE_RANGE) {
        // Give up — trot back home
        dog.chasing = false;
        const toHome = dog.home.clone().sub(dog.mesh.position);
        toHome.y = 0;
        const homeDist = toHome.length();
        if (homeDist > 0.5) {
          const step = Math.min(CHASE_SPEED * 0.35 * dt, homeDist);
          dog.mesh.position.addScaledVector(toHome.normalize(), step);
          dog.mesh.rotation.y = Math.atan2(-toHome.x, -toHome.z);
        }
      } else {
        const toward = car.position.clone().sub(dog.mesh.position);
        toward.y = 0;
        const len = toward.length();
        if (len > 0.1) {
          const step = Math.min(CHASE_SPEED * dt, len);
          toward.normalize();
          dog.mesh.position.addScaledVector(toward, step);
          dog.mesh.rotation.y = Math.atan2(-toward.x, -toward.z);
        }
      }
    }
  }

  get count(): number {
    return this.dogs.length;
  }
}
