import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Dog chase mechanic — pattern matches potholes.ts.
// Dogs are placed deterministically in town zones.  When the car passes
// within ACTIVATE_RADIUS the dog gives chase.  Kingston city dogs pause
// to "look both ways" before running — an authentic trait per GAME_SPEC.
// The narrator fires once per session on the first chase.

const ACTIVATE_RADIUS = 22;   // m — car wakes the dog
const GIVE_UP_RADIUS  = 60;   // m — dog abandons pursuit
const CATCH_RADIUS    = 3.5;  // m — dog gets close enough, stops
const DOG_SPEED       = 6.5;  // m/s
const CHASE_TIMEOUT   = 9_000; // ms — give up after this long regardless
const LOOK_DELAY      = 750;   // ms — Kingston look-both-ways pause

// Town zones: [from, to) point-index ranges where dogs appear.
// city=true  → Kingston look-both-ways flavour.
const TOWN_ZONES: readonly { from: number; to: number; city: boolean }[] = [
  { from:  38, to: 129, city: true  }, // Kingston (Harbour View → Hagley Park Rd)
  { from: 211, to: 240, city: false }, // Spanish Town (Burke Rd → Spanish Town Bypass)
  { from: 342, to: 391, city: false }, // Linstead (Bypass → King's Street)
  { from: 628, to: 642, city: false }, // Moneague (Golden Grove Rd junction)
  { from: 803, to: 839, city: false }, // Ocho Rios (DaCosta Dr → Northern Coastal Hwy)
];

const MIN_GAP     = 220; // m between dogs within a zone
const MAX_GAP     = 430;
const ROAD_OFFSET = 6.2; // m lateral from road centre (just past the verge)

type DogState = 'idle' | 'lookboth' | 'chasing' | 'done';

interface DogEntry {
  mesh: THREE.Group;
  pos: THREE.Vector3;   // current world position (mutated during chase)
  heading: number;      // current Y-rotation
  state: DogState;
  city: boolean;
  waitMs: number;       // countdown for look-both-ways delay
  chaseMs: number;      // elapsed ms while chasing
}

export class Dogs {
  readonly object: THREE.Group;
  private readonly dogs: DogEntry[] = [];
  private barkDone = false; // narrator fires once per session

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4242);

    for (const zone of TOWN_ZONES) {
      let nextAt = MIN_GAP * (0.3 + rng() * 0.7); // stagger first placement
      let zoneTravel = 0;
      const limit = Math.min(zone.to, road.points.length);

      for (let i = zone.from + 1; i < limit; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);

        while (zoneTravel + segLen >= nextAt) {
          const t = (nextAt - zoneTravel) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Perpendicular: positive = left side of forward direction
          const perp = new THREE.Vector3(-dir.z, 0, dir.x);
          const side = rng() > 0.55 ? 1 : -1;
          const lateralOff = ROAD_OFFSET + (rng() - 0.5) * 2.4;
          const pos = a.clone().lerp(b, t).addScaledVector(perp, side * lateralOff);
          pos.y = 0;

          // Face toward the road (perpendicular inward)
          const initHeading = Math.atan2(-dir.x, -dir.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);

          const mesh = makeDog();
          mesh.position.copy(pos);
          mesh.rotation.y = initHeading;
          this.object.add(mesh);

          this.dogs.push({
            mesh,
            pos: pos.clone(),
            heading: initHeading,
            state: 'idle',
            city: zone.city,
            waitMs: 0,
            chaseMs: 0,
          });

          nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
        }

        zoneTravel += segLen;
      }
    }
  }

  // Call once per frame.  dt in seconds.
  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const dog of this.dogs) {
      if (dog.state === 'done') continue;

      const distSq = dog.pos.distanceToSquared(carPos);
      const dist   = Math.sqrt(distSq);

      if (dog.state === 'idle') {
        if (dist < ACTIVATE_RADIUS) {
          if (dog.city) {
            dog.state  = 'lookboth';
            dog.waitMs = LOOK_DELAY;
          } else {
            dog.state = 'chasing';
            this.triggerBark();
          }
        }
        continue;
      }

      if (dog.state === 'lookboth') {
        dog.waitMs -= dt * 1000;
        // Oscillate heading to mime "looking both ways"
        const progress = 1 - dog.waitMs / LOOK_DELAY;
        dog.mesh.rotation.y = dog.heading + Math.sin(progress * Math.PI * 4) * 0.55;
        if (dog.waitMs <= 0) {
          dog.mesh.rotation.y = dog.heading; // snap back before chase
          dog.state = 'chasing';
          this.triggerBark();
        }
        continue;
      }

      // state === 'chasing'
      dog.chaseMs += dt * 1000;

      if (dist < CATCH_RADIUS || dist > GIVE_UP_RADIUS || dog.chaseMs > CHASE_TIMEOUT) {
        dog.state = 'done';
        continue;
      }

      // Move dog toward car (Y ignored — dogs stay on ground)
      const towardCar = new THREE.Vector3(
        carPos.x - dog.pos.x,
        0,
        carPos.z - dog.pos.z,
      ).normalize();

      dog.pos.x += towardCar.x * DOG_SPEED * dt;
      dog.pos.z += towardCar.z * DOG_SPEED * dt;
      dog.mesh.position.copy(dog.pos);

      dog.heading = Math.atan2(-towardCar.x, -towardCar.z);
      dog.mesh.rotation.y = dog.heading;

      // Bob the whole mesh slightly to suggest a running gait
      dog.mesh.position.y = Math.abs(Math.sin(dog.chaseMs / 140)) * 0.12;
    }
  }

  private triggerBark(): void {
    if (!this.barkDone) {
      this.barkDone = true;
      narrate('dog.chase');
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
