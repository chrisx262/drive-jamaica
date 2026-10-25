import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_RADIUS = 12;    // metres — car enters this zone, dog gives chase
const GIVE_UP_DIST = 60;    // metres — dog turns back once this far from home
const CHASE_SPEED = 6;      // m/s
const RETURN_SPEED = 3.5;   // m/s
const BARK_COOLDOWN = 5000; // ms between barks from the same dog

// Dogs live in town segments — city streets and Linstead market area.
// Kingston city dogs famously look both ways before crossing (GAME_SPEC note).
const DOG_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Church Road',
  'Main Road',
  'Wellington Street',
]);

interface DogState {
  mesh: THREE.Group;
  home: THREE.Vector3;
  chasing: boolean;
  returning: boolean;
  lastBark: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private sessionFirstChase = true;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const seg of road.segments) {
      if (!DOG_SEGMENTS.has(seg.name)) continue;
      const span = seg.to - seg.from;
      if (span < 1) continue;
      // 1–3 dogs per qualifying segment, more on longer stretches
      const count = 1 + Math.floor(rng() * 2) + (span > 15 ? 1 : 0);
      for (let d = 0; d < count; d++) {
        const ptIdx = seg.from + Math.floor(rng() * span);
        const pt = road.points[ptIdx];
        if (!pt) continue;
        const next = road.points[Math.min(ptIdx + 1, road.points.length - 1)];
        const dir = next.clone().sub(pt).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const side = rng() > 0.5 ? 1 : -1;
        const lateralOffset = side * (6 + rng() * 10);
        const pos = pt.clone().addScaledVector(perp, lateralOffset);
        pos.y = 0;
        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);
        this.dogs.push({
          mesh,
          home: pos.clone(),
          chasing: false,
          returning: false,
          lastBark: 0,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    for (const dog of this.dogs) {
      const dist = dog.mesh.position.distanceTo(car.position);

      if (!dog.chasing && !dog.returning && dist < CHASE_RADIUS) {
        dog.chasing = true;
        if (now - dog.lastBark > BARK_COOLDOWN) {
          dog.lastBark = now;
          narrate(this.sessionFirstChase ? 'dog.chase' : 'dog.bark');
          this.sessionFirstChase = false;
        }
      }

      if (dog.chasing) {
        const towardCar = car.position.clone().sub(dog.mesh.position);
        towardCar.y = 0;
        const d = towardCar.length();
        if (d > GIVE_UP_DIST) {
          dog.chasing = false;
          dog.returning = true;
        } else if (d > 0.1) {
          towardCar.normalize();
          dog.mesh.position.addScaledVector(towardCar, CHASE_SPEED * dt);
          dog.mesh.rotation.y = Math.atan2(towardCar.x, towardCar.z);
        }
      } else if (dog.returning) {
        const toHome = dog.home.clone().sub(dog.mesh.position);
        toHome.y = 0;
        const d = toHome.length();
        if (d < 0.5) {
          dog.returning = false;
          dog.mesh.position.copy(dog.home);
        } else {
          toHome.normalize();
          dog.mesh.position.addScaledVector(toHome, RETURN_SPEED * dt);
          dog.mesh.rotation.y = Math.atan2(toHome.x, toHome.z);
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
