import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const CHASE_RADIUS = 18;      // world-meters — car triggers the chase
const CHASE_SPEED = 8.5;      // m/s
const BARK_COOLDOWN = 7000;   // ms between bark narration during a chase
const GIVE_UP_DIST = 65;      // dog gives up this far behind the car

// Stretches where town dogs appear (point index ranges from route.json segments).
// Kingston city roads + Linstead town centre — no dogs on the pristine Palisadoes strip.
const TOWN_STRETCHES: [number, number][] = [
  [62, 130],   // Windward Road → Hagley Park Road (Kingston)
  [220, 265],  // Spanish Town
  [342, 395],  // Linstead bypass and town centre
];

const DOG_SPACING = 50; // minimum world-meters between dog spawn points

export class Dogs {
  readonly object: THREE.Group;
  private dogs: {
    mesh: THREE.Object3D;
    pos: THREE.Vector3;
    chasing: boolean;
    lastBark: number;
  }[] = [];
  private firstChaseThisSession = true;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const [from, to] of TOWN_STRETCHES) {
      let nextAt = DOG_SPACING * 0.6;
      let travelled = 0;

      for (let i = from + 1; i < Math.min(to, road.points.length); i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);

        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Dogs wait on the roadside — offset laterally off the carriageway
          const side = rng() > 0.5 ? 1 : -1;
          const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (5.5 + rng() * 7));
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const mesh = makeDog();
          mesh.position.copy(pos);
          // Face along the road initially
          mesh.rotation.y = Math.atan2(-dir.x, -dir.z) + (rng() - 0.5) * 0.6;
          this.object.add(mesh);
          this.dogs.push({ mesh, pos: pos.clone(), chasing: false, lastBark: 0 });
          nextAt += DOG_SPACING + rng() * DOG_SPACING;
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const now = performance.now();
    for (const dog of this.dogs) {
      const distSq = dog.pos.distanceToSquared(car.position);

      if (!dog.chasing && distSq < CHASE_RADIUS * CHASE_RADIUS) {
        dog.chasing = true;
        if (this.firstChaseThisSession) {
          narrate('dog.chase');
          this.firstChaseThisSession = false;
          dog.lastBark = now;
        }
      }

      if (dog.chasing) {
        if (distSq > GIVE_UP_DIST * GIVE_UP_DIST) {
          dog.chasing = false;
          continue;
        }
        const tocar = car.position.clone().sub(dog.pos).normalize();
        dog.pos.addScaledVector(tocar, CHASE_SPEED * dt);
        dog.mesh.position.copy(dog.pos);
        dog.mesh.rotation.y = Math.atan2(-tocar.x, -tocar.z);

        if (now - dog.lastBark > BARK_COOLDOWN) {
          narrate('dog.bark');
          dog.lastBark = now;
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
