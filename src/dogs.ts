import * as THREE from 'three';
import { makeDog } from './animals';
import type { Car } from './car';
import type { Road } from './road';
import { narrate } from './narrator';

// Dog segments: urban stretches where town dogs roam.
// Matches the GAME_SPEC: "dogs appear in towns; city dogs in Kingston famously
// look both ways before crossing."
const DOG_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Main Road',
  "King's Street",
  'Linstead Bypass',
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

const DOGS_PER_SEGMENT_KM = 1.2; // roughly one dog per ~830m compressed segment
const TRIGGER_RADIUS = 18;        // metres — dog activates when car is this close
const CHASE_SPEED = 7;            // m/s — fast enough to be alarming
const BARK_COOLDOWN = 12_000;     // ms between narrator barks (avoid spam)
const BARK_DURATION = 6_000;      // ms a chase lasts before the dog gives up

interface DogState {
  obj: THREE.Object3D;
  origin: THREE.Vector3;  // resting position
  chasing: boolean;
  chaseTimer: ReturnType<typeof setTimeout> | undefined;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedOnce = false;   // narrator fires only on first chase per session
  private lastBarkAt = -Infinity;

  constructor(road: Road) {
    this.object = new THREE.Group();
    const rng = mulberry32(1337);

    // Collect all points in dog-eligible segments.
    const eligible: THREE.Vector3[] = [];
    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segmentAt(i - 1);
      if (seg && DOG_SEGMENTS.has(seg.name)) eligible.push(road.points[i]);
    }

    // Place dogs spaced ~1/DOGS_PER_SEGMENT_KM km apart, offset to the side.
    let accum = 0;
    const spacing = 1000 / DOGS_PER_SEGMENT_KM;
    for (let i = 1; i < eligible.length; i++) {
      const a = eligible[i - 1];
      const b = eligible[i];
      const segLen = a.distanceTo(b);
      accum += segLen;
      if (accum < spacing) continue;
      accum -= spacing;

      const dir = b.clone().sub(a).normalize();
      const side = rng() < 0.5 ? 1 : -1;
      const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (5 + rng() * 3));
      const pos = a.clone().lerp(b, rng()).add(lateral);
      pos.y = 0;

      const dog = makeDog();
      dog.position.copy(pos);
      // Random resting orientation
      dog.rotation.y = rng() * Math.PI * 2;
      this.object.add(dog);
      this.dogs.push({ obj: dog, origin: pos.clone(), chasing: false, chaseTimer: undefined });
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    for (const d of this.dogs) {
      const dist = d.obj.position.distanceTo(car.position);

      if (!d.chasing && dist < TRIGGER_RADIUS) {
        d.chasing = true;
        clearTimeout(d.chaseTimer);
        d.chaseTimer = setTimeout(() => {
          d.chasing = false;
          // Dog trots back to resting spot over the next update ticks
        }, BARK_DURATION);

        if (!this.narratedOnce || now - this.lastBarkAt > BARK_COOLDOWN) {
          narrate('dog.chase');
          this.narratedOnce = true;
          this.lastBarkAt = now;
        }
      }

      if (d.chasing) {
        // Dog chases the car — moves toward car's position
        const towardCar = car.position.clone().sub(d.obj.position);
        const distToCar = towardCar.length();
        if (distToCar > 0.5) {
          towardCar.normalize().multiplyScalar(CHASE_SPEED * dt);
          d.obj.position.add(towardCar);
          d.obj.lookAt(car.position);
        }
      } else {
        // Drift back to origin
        d.obj.position.lerp(d.origin, 0.04);
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
