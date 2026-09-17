import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike, RouteSegment } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const CHASE_RADIUS = 18;   // car enters this range → dog starts chasing
const GIVE_UP_RADIUS = 50; // dog gives up when car escapes this far
const CHASE_SPEED = 7.5;   // m/s (~27 km/h, a determined Jamaican yard dog)
const BARK_DISTANCE = 10;  // dog is this close → fire narrator line (once per session)

// Segment name substrings where dogs are placed (towns / residential roads).
const TOWN_PATTERNS = [
  'Windward', 'Mountain View', 'Trafalgar', 'Hope Road', 'Hagley Park',
  'Spanish Town Road', 'DaCosta', 'King', 'Main Road', 'Linstead', 'Moneague',
];

const DOG_SPACING = 160; // meters along town segments between dogs (compressed world)
const DOG_LATERAL = 6;  // meters off road edge where dog sits waiting

interface DogAgent {
  mesh: THREE.Group;
  origin: THREE.Vector3;
  pos: THREE.Vector3;
  chasing: boolean;
  barked: boolean; // narrator line fires at most once per dog per session
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

function isTownSegment(seg: RouteSegment): boolean {
  return TOWN_PATTERNS.some((p) => seg.name.includes(p));
}

export class Dogs {
  readonly object: THREE.Group;
  private agents: DogAgent[] = [];
  private narratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0xd09);
    const pts = road.points;

    let distAlongSeg = 0;
    let nextDogAt = DOG_SPACING * (0.3 + rng() * 0.7);

    for (let i = 1; i < pts.length; i++) {
      const segIdx = road.segments.findIndex((s) => i >= s.from && i < s.to);
      if (segIdx < 0 || !isTownSegment(road.segments[segIdx])) {
        distAlongSeg = 0;
        nextDogAt = DOG_SPACING * (0.3 + rng() * 0.7);
        continue;
      }

      const a = pts[i - 1];
      const b = pts[i];
      const segLen = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);

      while (distAlongSeg + segLen >= nextDogAt) {
        const t = (nextDogAt - distAlongSeg) / segLen;
        const side = rng() < 0.5 ? 1 : -1;
        const pos = a.clone().lerp(b, t)
          .addScaledVector(perp, side * (DOG_LATERAL + rng() * 3));
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);

        this.agents.push({ mesh, origin: pos.clone(), pos: pos.clone(), chasing: false, barked: false });
        nextDogAt += DOG_SPACING * (0.5 + rng() * 1.0);
      }

      distAlongSeg += segLen;
      if (distAlongSeg >= nextDogAt) {
        distAlongSeg = 0;
        nextDogAt = DOG_SPACING * (0.3 + rng() * 0.7);
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const dog of this.agents) {
      const dist = dog.pos.distanceTo(carPos);

      if (!dog.chasing) {
        if (dist < CHASE_RADIUS) {
          dog.chasing = true;
        } else {
          continue;
        }
      }

      if (dist > GIVE_UP_RADIUS) {
        dog.chasing = false;
        // Return toward origin
        const toOrigin = dog.origin.clone().sub(dog.pos);
        if (toOrigin.length() > 0.5) {
          dog.pos.addScaledVector(toOrigin.normalize(), 3 * dt);
          dog.mesh.position.copy(dog.pos);
        }
        continue;
      }

      // Chase the car
      const tocar = carPos.clone().sub(dog.pos);
      const toCarlength = tocar.length();
      if (toCarlength > 0.1) {
        const step = Math.min(CHASE_SPEED * dt, toCarlength);
        dog.pos.addScaledVector(tocar.normalize(), step);
        dog.mesh.position.copy(dog.pos);
        dog.mesh.rotation.y = Math.atan2(tocar.x, tocar.z);
      }

      // Bark once per session when dog is close enough
      if (!dog.barked && toCarlength < BARK_DISTANCE) {
        dog.barked = true;
        if (!this.narratedThisSession) {
          this.narratedThisSession = true;
          narrate('dog.chase');
        }
      }
    }
  }
}
