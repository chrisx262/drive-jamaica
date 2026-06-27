import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

export const HIT_RADIUS = 1.4; // exported for debug overlay
const MIN_GAP = 90; // meters between potholes (compressed world)
const MAX_GAP = 280;
const BURST_SPEED = 13; // m/s — slower than this rolls through safely
// Emergency fallback: if the player never reaches a tyre shop, auto-repair after
// 4 minutes so they can't get stuck permanently. TyreShops handles the normal case.
const PATCH_AFTER = 240_000;
// Owner rule: government maintains the airport showcase road — no potholes
// until just past the Harbour View roundabout at the end of the Palisadoes.
const PRISTINE_UNTIL_SEGMENT = 'Norman Manley Highway / Palisadoes Road';

// Potholes scattered deterministically along the route. Hit one fast: tyre
// bursts (speed cap + wobble in Car) and the narrator lets you know.
export class Potholes {
  readonly object: THREE.Group;
  readonly positions: THREE.Vector3[] = [];
  private patchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2026);
    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x131316 });

    // Distance along the route where the pristine stretch ends
    const pristine = road.segments.find((s) => s.name === PRISTINE_UNTIL_SEGMENT);
    let pristineEnd = 0;
    if (pristine) {
      for (let i = 1; i < pristine.to; i++) pristineEnd += road.points[i - 1].distanceTo(road.points[i]);
    }

    let nextAt = pristineEnd + 80; // potholes start just past the roundabout
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar((rng() - 0.5) * 5.6);
        const pos = a.clone().lerp(b, t).add(lateral);
        pos.y = 0.015;
        this.positions.push(pos);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(pos);
        m.scale.setScalar(0.7 + rng() * 0.5);
        this.object.add(m);
        nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
      }
      travelled += segLen;
    }
  }

  update(car: Car): void {
    if (car.tyreBurst) return;
    const speed = Math.abs(car.speed);
    if (speed < BURST_SPEED) return;
    for (const p of this.positions) {
      if (p.distanceToSquared(car.position) > HIT_RADIUS * HIT_RADIUS) continue;
      car.burstTyre();
      narrate('pothole.burst');
      clearTimeout(this.patchTimer);
      this.patchTimer = setTimeout(() => {
        car.repairTyre();
        narrate('tyre.fixed');
      }, PATCH_AFTER);
      break;
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
