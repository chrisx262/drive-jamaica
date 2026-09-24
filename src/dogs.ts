import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const DETECT_RADIUS = 22;  // metres — car enters this → dog starts chasing
const CHASE_RADIUS  = 30;  // metres — dog gives up once car escapes this far
const DOG_SPEED     = 7.5; // m/s — fast dog, but a Corolla wins
const BARK_COOLDOWN = 8000; // ms between bark narrations per dog

// Town segments where stray dogs live (Kingston, Bog Walk town, Linstead)
const TOWN_SEGMENT_KEYWORDS = [
  'Windward Road',
  'Mountain View',
  'Stanton Terrace',
  'Fairway Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Burke Road',
  'Barrett Street',
  'White Church Street',
  'Wellington Street',
  'Church Road',
  'Main Road',
  "King's Street",
];

function isTownSegment(name: string): boolean {
  return TOWN_SEGMENT_KEYWORDS.some((k) => name.includes(k));
}

interface DogInstance {
  mesh: THREE.Group;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  lastBark: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private firstChaseFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0xd06d_0d06);

    // Spawn one dog per qualifying road point (sparse — approx every 60 m of town road)
    let countdown = 0;
    for (let i = 0; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !isTownSegment(seg.name)) { countdown = 0; continue; }
      countdown--;
      if (countdown > 0) continue;
      countdown = 4 + Math.floor(rng() * 6); // 4-9 points gap between dogs

      const pt = road.points[i];
      const dir = i < road.points.length - 1
        ? road.points[i + 1].clone().sub(pt).normalize()
        : road.points[i].clone().sub(road.points[i - 1]).normalize();
      // Place dog on the left verge (left of direction of travel = +perp)
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const side = rng() > 0.5 ? 1 : -1;
      const offset = (6.5 + rng() * 4) * side;
      const home = pt.clone().addScaledVector(perp, offset);
      home.y = 0;

      const mesh = makeDog();
      mesh.position.copy(home);
      mesh.rotation.y = Math.atan2(-dir.x, -dir.z) + (side > 0 ? Math.PI : 0);
      this.object.add(mesh);

      this.dogs.push({ mesh, home: home.clone(), pos: home.clone(), chasing: false, lastBark: 0 });
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    const now = performance.now();

    for (const dog of this.dogs) {
      const distSq = dog.pos.distanceToSquared(carPos);
      const homeDist = dog.pos.distanceTo(dog.home);

      if (!dog.chasing && distSq < DETECT_RADIUS * DETECT_RADIUS) {
        dog.chasing = true;
        if (!this.firstChaseFired) {
          this.firstChaseFired = true;
          narrate('dog.chase');
        } else if (now - dog.lastBark > BARK_COOLDOWN) {
          dog.lastBark = now;
          narrate('dog.bark');
        }
      }

      if (dog.chasing) {
        if (distSq > CHASE_RADIUS * CHASE_RADIUS) {
          // Car escaped — dog trots home
          dog.chasing = false;
        } else {
          // Chase: step toward car
          const towardCar = carPos.clone().sub(dog.pos).setY(0);
          const len = towardCar.length();
          if (len > 0.1) {
            towardCar.normalize().multiplyScalar(DOG_SPEED * dt);
            dog.pos.add(towardCar);
            dog.mesh.position.copy(dog.pos);
            dog.mesh.rotation.y = Math.atan2(-towardCar.x, -towardCar.z);
          }
        }
      } else if (homeDist > 0.3) {
        // Trot back home
        const toHome = dog.home.clone().sub(dog.pos).setY(0).normalize().multiplyScalar(DOG_SPEED * 0.5 * dt);
        dog.pos.add(toHome);
        dog.mesh.position.copy(dog.pos);
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
