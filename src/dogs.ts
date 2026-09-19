import * as THREE from 'three';
import { makeDog } from './animals';
import { mulberry32 } from './rng';
import type { RoadLike, RouteSegment } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Dogs appear in town segments; when the car passes within CHASE_RADIUS they
// start chasing. Kingston city dogs famously look both ways before crossing
// — they pause briefly at the road edge before committing (GAME_SPEC behaviour).
// Narrator line fires once per session on the first close encounter.

const CHASE_RADIUS = 18;    // m — car enters this range → dog reacts
const GIVE_UP_RADIUS = 52;  // m — dog gives up when car is this far ahead
const CHASE_SPEED = 7.5;    // m/s (~27 km/h — a determined Jamaican yard dog)
const BARK_DISTANCE = 10;   // m — dog this close → fire narrator caption
const LOOK_BOTH_WAYS_MS = 600; // ms Kingston dogs pause before starting the chase

const DOG_SPACING = 160; // m along town segments between dogs (compressed world)
const DOG_LATERAL = 6;   // m off road edge where the dog waits

// Segment name substrings that count as "town" — dogs live here.
// Matched against actual route.json segment names.
const TOWN_PATTERNS = [
  'Windward', 'Mountain View', 'Trafalgar', 'Hope Road', 'Hagley Park',
  'Spanish Town Road', 'DaCosta', "King's Street", 'Main Road',
  'Stanton Terrace', 'Fairway', 'Church Road',
  'Linstead', 'Moneague',
];

// Kingston city segments where the "looks both ways" pause applies.
const KINGSTON_PATTERNS = [
  'Windward', 'Mountain View', 'Stanton Terrace', 'Fairway',
  'Trafalgar', 'Hope Road', 'Hagley Park',
];

interface DogAgent {
  mesh: THREE.Group;
  origin: THREE.Vector3;
  pos: THREE.Vector3;
  /** true if the dog is in town Kingston segments → looks both ways first */
  isKingstonDog: boolean;
  /** null = idle, ≥0 = look-both-ways countdown (ms), -1 = chasing */
  state: null | number | -1;
  barked: boolean;
}

function isTownSegment(seg: RouteSegment): boolean {
  return TOWN_PATTERNS.some((p) => seg.name.includes(p));
}

function isKingstonSegment(seg: RouteSegment): boolean {
  return KINGSTON_PATTERNS.some((p) => seg.name.includes(p));
}

export class Dogs {
  readonly object: THREE.Group;
  private agents: DogAgent[] = [];
  private narratedThisSession = false;
  private narratedKingstonThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0xd09);
    const pts = road.points;

    let distAlongSeg = 0;
    let nextDogAt = DOG_SPACING * (0.3 + rng() * 0.7);

    for (let i = 1; i < pts.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !isTownSegment(seg)) {
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

        this.agents.push({
          mesh,
          origin: pos.clone(),
          pos: pos.clone(),
          isKingstonDog: isKingstonSegment(seg),
          state: null,
          barked: false,
        });
        nextDogAt += DOG_SPACING * (0.5 + rng() * 1.0);
      }

      distAlongSeg += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const dog of this.agents) {
      const dist = dog.pos.distanceTo(carPos);

      // Idle: watch for the car entering chase range.
      if (dog.state === null) {
        if (dist < CHASE_RADIUS) {
          if (dog.isKingstonDog) {
            // Look both ways — pause before chasing.
            dog.state = LOOK_BOTH_WAYS_MS;
            // Face the car during the look.
            const tocar = carPos.clone().sub(dog.pos);
            dog.mesh.rotation.y = Math.atan2(tocar.x, tocar.z);
          } else {
            dog.state = -1; // straight to chase
          }
        }
        continue;
      }

      // Look-both-ways countdown (Kingston dogs).
      if (typeof dog.state === 'number' && dog.state > 0) {
        dog.state -= dt * 1000;
        if (dog.state <= 0) {
          dog.state = -1; // done looking — now chase
          if (!this.narratedKingstonThisSession) {
            this.narratedKingstonThisSession = true;
            narrate('dog.chase.kingston');
          }
        }
        continue;
      }

      // Chasing (state === -1).
      if (dist > GIVE_UP_RADIUS) {
        dog.state = null;
        // Trot back toward origin.
        const toOrigin = dog.origin.clone().sub(dog.pos);
        if (toOrigin.length() > 0.5) {
          dog.pos.addScaledVector(toOrigin.normalize(), 3 * dt);
          dog.mesh.position.copy(dog.pos);
        }
        continue;
      }

      const tocar = carPos.clone().sub(dog.pos);
      const toCarlength = tocar.length();
      if (toCarlength > 0.1) {
        const step = Math.min(CHASE_SPEED * dt, toCarlength);
        dog.pos.addScaledVector(tocar.normalize(), step);
        dog.mesh.position.copy(dog.pos);
        dog.mesh.rotation.y = Math.atan2(tocar.x, tocar.z);
      }

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
