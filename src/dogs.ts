import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';
import dogsData from '../data/dogs.json';

const TRIGGER_RADIUS = 16; // m — car within this range wakes a sleeping dog
const GIVE_UP_RADIUS = 26; // m — dog abandons the chase beyond this
const CHASE_SPEED = 9; // m/s — slower than a cruising car; the car always outruns it
const TROT_HOME_SPEED = 4.5; // m/s
const LOOK_BOTH_WAYS = 0.6; // s — Kingston dogs pause before giving chase

type Phase = 'idle' | 'looking' | 'chasing' | 'returning';

interface Dog {
  object: THREE.Group;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  phase: Phase;
  phaseTimer: number;
  bark: number; // animation clock
  looksBothWays: boolean;
}

// Dogs scattered through town segments (data/dogs.json). Passing close wakes
// one; it chases and barks until the car outruns it, then trots back home.
// Cosmetic only — never touches car speed/steering (see CLAUDE.md guardrail).
export class Dogs {
  readonly object: THREE.Group;
  private readonly dogs: Dog[] = [];
  private hasChasedOnce = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(dogsData.globalSeed);
    const townSegments = new Set(dogsData.townSegments);
    const kingstonSegments = new Set(dogsData.kingstonSegments);
    const { minGap, maxGap } = dogsData;

    for (const seg of road.segments) {
      if (!townSegments.has(seg.name)) continue;
      const inKingston = kingstonSegments.has(seg.name);
      let travelled = 0;
      let nextAt = rng() * minGap;
      for (let i = seg.from + 1; i < seg.to; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);
        while (travelled + segLen >= nextAt) {
          const t = segLen > 0 ? (nextAt - travelled) / segLen : 0;
          const dir = b.clone().sub(a).normalize();
          const side = rng() < 0.5 ? -1 : 1;
          const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (5 + rng() * 4));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const dogObj = makeDog();
          dogObj.position.copy(pos);
          dogObj.rotation.y = rng() * Math.PI * 2;
          this.object.add(dogObj);
          this.dogs.push({
            object: dogObj, home: pos.clone(), pos: pos.clone(),
            phase: 'idle', phaseTimer: 0, bark: rng() * 10, looksBothWays: inKingston,
          });

          nextAt += minGap + rng() * (maxGap - minGap);
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const distToCar = dog.pos.distanceTo(car.position);

      if (dog.phase === 'idle' && distToCar < TRIGGER_RADIUS && Math.abs(car.speed) > 1) {
        dog.phase = dog.looksBothWays ? 'looking' : 'chasing';
        dog.phaseTimer = 0;
      } else if (dog.phase === 'looking') {
        dog.phaseTimer += dt;
        dog.object.rotation.y += Math.sin(dog.phaseTimer * 14) * 1.2 * dt;
        if (dog.phaseTimer >= LOOK_BOTH_WAYS) dog.phase = 'chasing';
      } else if (dog.phase === 'chasing') {
        if (!this.hasChasedOnce) {
          this.hasChasedOnce = true;
          narrate('dog.chase');
        }
        if (distToCar > GIVE_UP_RADIUS) {
          dog.phase = 'returning';
        } else {
          const toCar = car.position.clone().sub(dog.pos).setY(0);
          const dist = toCar.length();
          if (dist > 0.5) {
            toCar.normalize();
            dog.pos.addScaledVector(toCar, Math.min(CHASE_SPEED * dt, dist));
            dog.object.rotation.y = Math.atan2(-toCar.x, -toCar.z);
          }
        }
      } else if (dog.phase === 'returning') {
        const toHome = dog.home.clone().sub(dog.pos).setY(0);
        const dist = toHome.length();
        if (dist < 0.3) {
          dog.pos.copy(dog.home);
          dog.phase = 'idle';
        } else {
          toHome.normalize();
          dog.pos.addScaledVector(toHome, Math.min(TROT_HOME_SPEED * dt, dist));
          dog.object.rotation.y = Math.atan2(-toHome.x, -toHome.z);
        }
      }

      dog.object.position.x = dog.pos.x;
      dog.object.position.z = dog.pos.z;
      // Bounce/bark animation while chasing or trotting home.
      if (dog.phase === 'chasing' || dog.phase === 'returning') {
        dog.bark += dt * 10;
        dog.object.position.y = Math.abs(Math.sin(dog.bark)) * 0.18;
      } else {
        dog.object.position.y = 0;
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
