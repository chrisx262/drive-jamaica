import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_RADIUS = 18;   // m: dog starts running at the car
const FLEE_RADIUS  = 42;   // m: dog gives up and trots home
const CHASE_SPEED  = 7;    // m/s dog sprint
const DOG_SPACING  = 180;  // approx m between dogs on eligible segments

// Segments where town dogs hang out roadside
const TOWN_SEGS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Spanish Town Road',
  'Main Road',
  "King's Street",
]);

export class Dogs {
  readonly object: THREE.Group;
  private dogs: { mesh: THREE.Object3D; home: THREE.Vector3; chasing: boolean }[] = [];
  private chasedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);
    let travelled = 0;
    let nextAt = DOG_SPACING * (0.3 + rng() * 0.4);

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const inTown = seg ? TOWN_SEGS.has(seg.name) : false;
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      if (inTown) {
        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const fwd = b.clone().sub(a).normalize();
          const side = rng() > 0.5 ? 1 : -1;
          const lateral = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(side * (3.5 + rng() * 2.5));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;
          const mesh = makeDog();
          mesh.position.copy(pos);
          mesh.rotation.y = rng() * Math.PI * 2;
          this.object.add(mesh);
          this.dogs.push({ mesh, home: pos.clone(), chasing: false });
          nextAt += DOG_SPACING * (0.55 + rng() * 0.9);
        }
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const distToHome = dog.home.distanceTo(carPos);
      if (!dog.chasing && distToHome < CHASE_RADIUS) {
        dog.chasing = true;
        if (!this.chasedThisSession) {
          this.chasedThisSession = true;
          narrate('dog.chase');
        }
      }
      if (!dog.chasing) continue;

      const distToCar = dog.mesh.position.distanceTo(carPos);
      if (distToCar > FLEE_RADIUS) {
        dog.chasing = false;
      } else {
        const dir = carPos.clone().sub(dog.mesh.position).normalize();
        dog.mesh.position.addScaledVector(dir, CHASE_SPEED * dt);
        dog.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
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
