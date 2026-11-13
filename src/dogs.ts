import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs scattered through town sections. When the car passes within range a
// dog gives chase (and barks). First chase per session fires the narrator.
// Dogs give up once the car is far enough away and return to their home spot.

const ACTIVATE_DIST = 25;   // m — car enters this range → dog starts chasing
const GIVE_UP_DIST  = 65;   // m — dog stops and returns home
const CHASE_SPEED   = 7;    // m/s (fast enough to feel urgent, car always wins)
const RETURN_SPEED  = 4;    // m/s — trot home after giving up
const BARK_COOLDOWN = 4000; // ms between bark narrates while chasing

// Named segment fragments whose stretches host dogs
const TOWN_SEGS: string[] = [
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Nelson Mandela Highway',
  "King's Street",
  'Wellington Street',
  'Main Road',
];

interface DogState {
  mesh: THREE.Group;
  home: THREE.Vector3;
  active: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private chaseNarratedThisSession = false;
  private lastBarkAt = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(5050);

    for (const seg of road.segments) {
      if (!TOWN_SEGS.some((t) => seg.name.includes(t))) continue;

      const span = seg.to - seg.from;
      // One dog roughly every 12 route-points (avoids overcrowding)
      const count = Math.max(1, Math.floor(span / 12));
      for (let i = 0; i < count; i++) {
        const idx = seg.from + 1 + Math.floor(rng() * Math.max(1, span - 1));
        if (idx >= road.points.length - 1) continue;

        const pt = road.points[idx].clone();
        const fwd = road.points[idx + 1].clone().sub(pt).normalize();
        const perp = new THREE.Vector3(-fwd.z, 0, fwd.x);

        // Roadside — 5-9 m from centre, random side
        const side  = rng() > 0.5 ? 1 : -1;
        const offset = 5 + rng() * 4;
        const home = pt.clone().addScaledVector(perp, side * offset);
        home.y = 0;

        const mesh = makeDog();
        mesh.position.copy(home);
        // Face toward road
        mesh.lookAt(pt.x, 0, pt.z);
        this.object.add(mesh);
        this.dogs.push({ mesh, home: home.clone(), active: false });
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();

    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(car.position);

      if (!dog.active) {
        if (dist < ACTIVATE_DIST) {
          dog.active = true;
          if (!this.chaseNarratedThisSession) {
            this.chaseNarratedThisSession = true;
            narrate('dog.chase');
            this.lastBarkAt = now;
          }
        } else {
          // Return home if displaced
          const toHome = dog.home.clone().sub(dog.mesh.position).setY(0);
          if (toHome.length() > 0.3) {
            toHome.normalize().multiplyScalar(RETURN_SPEED * dt);
            dog.mesh.position.add(toHome);
          }
        }
        continue;
      }

      if (dist > GIVE_UP_DIST) {
        dog.active = false;
        continue;
      }

      // Bark reminder while chasing
      if (now - this.lastBarkAt > BARK_COOLDOWN) {
        narrate('dog.bark');
        this.lastBarkAt = now;
      }

      // Chase: move toward the car
      const toward = car.position.clone().sub(dog.mesh.position).setY(0).normalize();
      dog.mesh.position.addScaledVector(toward, CHASE_SPEED * dt);
      dog.mesh.lookAt(car.position.x, dog.mesh.position.y, car.position.z);
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
