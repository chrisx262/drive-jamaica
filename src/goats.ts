import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross the road unattended on the country sections between
// Linstead and Moneague. Hitting one triggers a score penalty and narrator
// scolding. Each herd walks slowly across the road; goats disappear after
// crossing or being hit (cartoon physics — they don't linger).

const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

const HERD_SPACING = 420;  // meters between herds
const GOAT_SPEED = 1.6;    // m/s — unhurried saunter
const HIT_RADIUS = 1.8;    // m — collision triggers penalty
const CROSS_DIST = 18;     // m — how far goat walks before clearing the road

interface GoatState {
  mesh: THREE.Object3D;
  crossDir: THREE.Vector3;
  distCrossed: number;
  hit: boolean;
  done: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private goats: GoatState[] = [];
  readonly hitPositions: THREE.Vector3[] = []; // for debug overlay

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(3317);

    let travelled = 0;
    let nextAt = HERD_SPACING * (0.4 + rng() * 0.6);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);

      if (!seg || !GOAT_SEGMENTS.has(seg.name)) {
        travelled += segLen;
        nextAt = travelled + HERD_SPACING * (0.4 + rng() * 0.6);
        continue;
      }

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const herdCenter = a.clone().lerp(b, t);
        herdCenter.y = 0;

        const roadDir = b.clone().sub(a).normalize();
        // Perpendicular cross direction; randomly pick which side they start from
        const crossDir = new THREE.Vector3(-roadDir.z, 0, roadDir.x);
        if (rng() < 0.5) crossDir.negate();

        const herdSize = 2 + Math.floor(rng() * 3); // 2–4 goats
        for (let g = 0; g < herdSize; g++) {
          // Stagger goats along the road and back from the starting edge
          const alongOffset = (g - herdSize / 2) * 1.6;
          const backOffset = rng() * 2;
          const startPos = herdCenter.clone()
            .addScaledVector(crossDir, -(8 + backOffset))
            .addScaledVector(roadDir, alongOffset);
          startPos.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(startPos);
          mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
          this.object.add(mesh);
          this.goats.push({
            mesh,
            crossDir: crossDir.clone(),
            distCrossed: 0,
            hit: false,
            done: false,
          });
          this.hitPositions.push(startPos.clone());
        }

        nextAt += HERD_SPACING * (0.4 + rng() * 0.6);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const goat of this.goats) {
      if (goat.done) continue;

      // Collision check before moving
      if (!goat.hit && goat.mesh.position.distanceTo(car.position) < HIT_RADIUS) {
        goat.hit = true;
        goat.done = true;
        narrate('goat.hit');
        this.object.remove(goat.mesh);
        continue;
      }

      // Walk across the road
      const step = GOAT_SPEED * dt;
      goat.mesh.position.addScaledVector(goat.crossDir, step);
      goat.distCrossed += step;

      if (goat.distCrossed >= CROSS_DIST) {
        goat.done = true;
        this.object.remove(goat.mesh);
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
