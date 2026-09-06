import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';
import { mulberry32 } from './rng';
import { addScoringEvent } from './scoring';

const WAKE_RADIUS = 28;       // car must enter this radius to wake a dog
const GIVE_UP_DIST = 90;      // dog gives up when this far from its start
const DOG_SPEED = 7.5;        // m/s — fast enough to be alarming, too slow to catch a car

// Point-index ranges (inclusive from, exclusive to) where dogs roam.
// Covers urban/town sections: Kingston city, Spanish Town, Linstead.
const DOG_ZONES: { from: number; to: number }[] = [
  { from: 62,  to: 129 },   // Windward Rd → Hagley Park Rd (Kingston)
  { from: 226, to: 250 },   // Spanish Town
  { from: 342, to: 391 },   // Linstead town
];

const MIN_GAP = 80;    // minimum metres between dogs
const MAX_GAP = 220;

class DogInstance {
  readonly mesh: THREE.Object3D;
  readonly startPos: THREE.Vector3;
  private chasing = false;
  private done = false;

  constructor(pos: THREE.Vector3) {
    this.startPos = pos.clone();
    this.mesh = makeDog();
    this.mesh.position.copy(pos);
  }

  update(dt: number, carPos: THREE.Vector3): boolean {
    if (this.done) return false;

    const distToCar = this.mesh.position.distanceTo(carPos);

    if (!this.chasing) {
      if (distToCar > WAKE_RADIUS) return false;
      this.chasing = true;
      return true; // signal first-chase to caller for narrator trigger
    }

    // Give up if chased too far from home territory
    if (this.mesh.position.distanceTo(this.startPos) > GIVE_UP_DIST) {
      this.chasing = false;
      this.done = true;
      this.mesh.visible = false;
      return false;
    }

    // Chase the car
    const dir = carPos.clone().sub(this.mesh.position);
    dir.y = 0;
    const len = dir.length();
    if (len > 0.01) {
      dir.divideScalar(len);
      this.mesh.position.addScaledVector(dir, DOG_SPEED * dt);
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
    return false;
  }
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private chaseNarratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    // Cumulative distance to each point so we can place dogs by metres.
    const cumDist: number[] = [0];
    for (let i = 1; i < road.points.length; i++) {
      cumDist.push(cumDist[i - 1] + road.points[i - 1].distanceTo(road.points[i]));
    }

    for (const zone of DOG_ZONES) {
      const zoneStart = cumDist[zone.from];
      const zoneEnd   = cumDist[Math.min(zone.to, road.points.length - 1)];
      let nextAt = zoneStart + MIN_GAP * 0.5;

      for (let i = zone.from + 1; i < zone.to && i < road.points.length; i++) {
        while (cumDist[i] >= nextAt && nextAt < zoneEnd) {
          const a = road.points[i - 1];
          const b = road.points[i];
          const segDist = cumDist[i] - cumDist[i - 1];
          const t = segDist > 0 ? (nextAt - cumDist[i - 1]) / segDist : 0;
          const dir = b.clone().sub(a).normalize();
          // Place dog 3–6 m off the road edge
          const side = (rng() > 0.5 ? 1 : -1) * (3 + rng() * 3);
          const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);
          const pos = a.clone().lerp(b, t).add(lateral);
          pos.y = 0;

          const dog = new DogInstance(pos);
          this.dogs.push(dog);
          this.object.add(dog.mesh);

          nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
        }
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const dog of this.dogs) {
      const firstChase = dog.update(dt, car.position);
      if (firstChase && !this.chaseNarratedThisSession) {
        this.chaseNarratedThisSession = true;
        narrate('dog.chase');
        addScoringEvent('dog.chase');
      }
    }
  }
}
