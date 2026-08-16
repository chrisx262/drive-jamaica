import * as THREE from 'three';
import { makeDog } from './animals';
import { narrate } from './narrator';
import type { Car } from './car';

// Dogs appear near towns and chase the car when it passes within trigger range.
// Per GAME_SPEC: city dogs look both ways before crossing. No damage — pure
// chaos + narrator line on first chase per session.
//
// Public API matches the pattern of src/potholes.ts.

const TRIGGER_RADIUS = 18;     // metres — dog wakes and chases
const CHASE_RADIUS   = 40;     // metres — dog gives up beyond this
const DOG_SPEED      = 7.5;    // m/s — fast enough to look menacing at low speed
const BARK_COOLDOWN  = 14_000; // ms between narrator lines per dog

// Town stretches by route point-index ranges (from route.json segments).
// Dogs appear in built-up areas only: Harbour View through Kingston,
// Spanish Town, and the Linstead / Ocho Rios legs.
const TOWN_RANGES: [number, number][] = [
  [38,  62],   // Sir Florizel Glaspole Blvd (Harbour View)
  [62,  73],   // Windward Road
  [73,  92],   // Mountain View Avenue
  [111, 124],  // Hagley Park Road (Half Way Tree)
  [220, 240],  // Spanish Town (Wellington St / bypass)
  [347, 391],  // Linstead (Main Road / King's Street)
  [630, 700],  // Moneague–Ocho Rios Road
];
const DOGS_PER_STRETCH = 3;

interface DogState {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  lastBark: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedOnce = false;

  constructor(points: THREE.Vector3[]) {
    this.object = new THREE.Group();
    const rng = mulberry32(4242);

    for (const [from, to] of TOWN_RANGES) {
      for (let k = 0; k < DOGS_PER_STRETCH; k++) {
        const idx = from + Math.floor(rng() * (to - from - 1));
        if (idx >= points.length - 1) continue;

        const a = points[idx];
        const b = points[idx + 1];
        const fwd = b.clone().sub(a).normalize();
        const side = rng() < 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(side * (5 + rng() * 5));
        const home = a.clone().lerp(b, rng()).add(lateral);
        home.y = 0;

        const mesh = makeDog();
        mesh.position.copy(home);
        mesh.rotation.y = Math.atan2(lateral.x, lateral.z);
        this.object.add(mesh);

        this.dogs.push({
          mesh,
          home: home.clone(),
          pos: home.clone(),
          chasing: false,
          lastBark: -Infinity,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    const carPos = car.position;

    for (const dog of this.dogs) {
      const distSq = dog.pos.distanceToSquared(carPos);

      if (!dog.chasing) {
        if (distSq < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          dog.chasing = true;
          if (!this.narratedOnce || now - dog.lastBark > BARK_COOLDOWN) {
            narrate('dog.chase');
            this.narratedOnce = true;
            dog.lastBark = now;
          }
        }
      }

      if (dog.chasing) {
        if (distSq > CHASE_RADIUS * CHASE_RADIUS) {
          dog.chasing = false;
        } else {
          const towardsCar = carPos.clone().sub(dog.pos);
          towardsCar.y = 0;
          const d = towardsCar.length();
          if (d > 0.1) {
            const step = Math.min(DOG_SPEED * dt, d);
            dog.pos.addScaledVector(towardsCar.normalize(), step);
            dog.mesh.position.copy(dog.pos);
            dog.mesh.rotation.y = Math.atan2(towardsCar.x, towardsCar.z);
          }
        }
      } else if (dog.pos.distanceToSquared(dog.home) > 0.5) {
        // Trot back home when not chasing
        const toHome = dog.home.clone().sub(dog.pos);
        const d = toHome.length();
        const step = Math.min(DOG_SPEED * 0.4 * dt, d);
        dog.pos.addScaledVector(toHome.normalize(), step);
        dog.mesh.position.copy(dog.pos);
        if (d > 0.5) dog.mesh.rotation.y = Math.atan2(toHome.x, toHome.z);
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
