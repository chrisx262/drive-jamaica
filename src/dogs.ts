import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Dogs appear in town sections; when the car passes within range one chases
// and barks. Narrator line fires once per session on first chase.
// Owner rule (GAME_SPEC): city dogs in Kingston famously look both ways before crossing.

const CHASE_RADIUS = 18;    // metres — dog locks on and runs at the car
const SCATTER_RADIUS = 40;  // dogs start from beside the road
const MIN_GAP = 60;         // metres between dog spawn points
const MAX_GAP = 220;

// Urban segment names — dogs only appear in town sections, not open country.
const URBAN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Eastwood Park Road',
  'South Odeon Avenue',
  'Bus Lane',
  'Spanish Town Road',
  'Nelson Mandela Highway',
  'Twikenham Park Road',
  'Twickenham Park Road',
  'Sligoville Road',
  'Selassie Road',
  'Mahole Drive',
  'Burke Road',
  'Barrett Street',
  'White Church Street',
  'Wellington Street',
  'Church Road',
  'Main Road',
  "King's Street",
]);

interface DogState {
  obj: THREE.Group;
  origin: THREE.Vector3;
  chasing: boolean;
  done: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedChase = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    const urbanRanges: { from: number; to: number }[] = [];
    for (const seg of road.segments) {
      if (URBAN_SEGMENTS.has(seg.name)) urbanRanges.push({ from: seg.from, to: seg.to });
    }

    let nextAt = MIN_GAP;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const isUrban = urbanRanges.some((r) => i >= r.from && i < r.to);

      if (isUrban) {
        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          const side = rng() > 0.5 ? 1 : -1;
          const lateral = new THREE.Vector3(dir.z, 0, -dir.x)
            .multiplyScalar(side * (SCATTER_RADIUS * 0.3 + rng() * SCATTER_RADIUS * 0.4));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const dog = makeDog();
          dog.position.copy(pos);
          dog.rotation.y = Math.atan2(-lateral.x, -lateral.z);
          this.object.add(dog);
          this.dogs.push({ obj: dog, origin: pos.clone(), chasing: false, done: false });

          nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
        }
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const d of this.dogs) {
      if (d.done) continue;
      const dist = d.obj.position.distanceTo(carPos);

      if (dist < CHASE_RADIUS) {
        if (!d.chasing) {
          d.chasing = true;
          if (!this.narratedChase) {
            this.narratedChase = true;
            narrate('dog.chase');
          }
        }
        const towards = carPos.clone().sub(d.obj.position);
        towards.y = 0;
        const len = towards.length();
        if (len > 0.1) {
          towards.divideScalar(len);
          const speed = 6 + Math.min(car.speedKmh, 80) * 0.04;
          d.obj.position.addScaledVector(towards, speed * dt);
          d.obj.rotation.y = Math.atan2(-towards.x, -towards.z);
        }
        if (dist < 1.5) d.done = true; // tagged the car; give up
      } else if (d.chasing && dist > CHASE_RADIUS * 2.5) {
        // Car got away — trot back to origin
        const home = d.origin.clone().sub(d.obj.position);
        home.y = 0;
        const hl = home.length();
        if (hl < 0.5) {
          d.chasing = false;
          d.obj.position.copy(d.origin);
        } else {
          home.divideScalar(hl);
          d.obj.position.addScaledVector(home, 3 * dt);
          d.obj.rotation.y = Math.atan2(-home.x, -home.z);
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
