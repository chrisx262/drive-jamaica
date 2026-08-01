import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Town road-name substrings where street dogs live (Kingston city streets,
// Linstead main drag — dogs roam towns, not country highway).
const TOWN_NAMES = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Wellington Street',
  'Church Road',
  'Main Road',
  "King's Street",
]);

const SPACING = 200;     // metres between dogs along town road
const CHASE_DIST = 22;   // dog notices car and gives chase
const GIVE_UP_DIST = 55; // dog abandons chase (too far from home)
const DOG_SPEED = 7;     // m/s sprint
const HOME_SPEED = 3;    // m/s trot back to home

function isTownSegment(name: string): boolean {
  for (const t of TOWN_NAMES) if (name === t) return true;
  return false;
}

interface DogState {
  mesh: THREE.Group;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  facing: number;
  chasing: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedOnce = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0xd06c4a51);

    // Walk the polyline and scatter dogs in town segments only.
    let distAlongRoute = 0;
    let nextDogAt = SPACING * (0.3 + rng() * 0.7); // randomise first placement

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const segLen = a.distanceTo(b);

      if (seg && isTownSegment(seg.name)) {
        while (distAlongRoute + segLen >= nextDogAt) {
          const t = (nextDogAt - distAlongRoute) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Lateral offset so dog stands on the kerb, not the road centre.
          const side = rng() > 0.5 ? 1 : -1;
          const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (4.5 + rng() * 2));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          // Randomise dog colour slightly.
          const hue = rng();
          mesh.traverse((c) => {
            if (c instanceof THREE.Mesh) {
              const m = c.material as THREE.MeshLambertMaterial;
              if (m.color) {
                const shifted = new THREE.Color().setHSL(0.07 + hue * 0.04, 0.5 + rng() * 0.3, 0.3 + rng() * 0.25);
                m.color.copy(shifted);
              }
            }
          });
          this.object.add(mesh);

          this.dogs.push({
            mesh,
            home: pos.clone(),
            pos: pos.clone(),
            facing: Math.atan2(-dir.x, -dir.z),
            chasing: false,
          });

          nextDogAt += SPACING * (0.6 + rng() * 0.8);
        }
      }

      distAlongRoute += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const distToCar = dog.pos.distanceTo(carPos);
      const distToHome = dog.pos.distanceTo(dog.home);

      if (!dog.chasing) {
        if (distToCar < CHASE_DIST) {
          dog.chasing = true;
          if (!this.narratedOnce) {
            this.narratedOnce = true;
            narrate('dog.chase');
          }
        } else if (distToHome > 0.5) {
          // Trot back home.
          moveToward(dog, dog.home, HOME_SPEED, dt);
        }
      } else {
        if (distToCar > GIVE_UP_DIST || dog.pos.distanceTo(dog.home) > GIVE_UP_DIST) {
          dog.chasing = false;
        } else {
          moveToward(dog, carPos, DOG_SPEED, dt);
        }
      }

      dog.mesh.position.copy(dog.pos);
      dog.mesh.rotation.y = dog.facing;
    }
  }

  get dogCount(): number {
    return this.dogs.length;
  }
}

function moveToward(dog: DogState, target: THREE.Vector3, speed: number, dt: number): void {
  const dx = target.x - dog.pos.x;
  const dz = target.z - dog.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;
  const step = Math.min(speed * dt, dist);
  dog.pos.x += (dx / dist) * step;
  dog.pos.z += (dz / dist) * step;
  dog.facing = Math.atan2(-dx, -dz);
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
