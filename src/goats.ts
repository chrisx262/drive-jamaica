import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const HIT_RADIUS = 1.4;       // world meters
const NEAR_MISS_RADIUS = 4;   // world meters
const CROSSING_SPEED = 1.2;   // m/s — goats walk slowly
const SCORE_PENALTY = 50;
const HERD_SIZE = 4;
const STAGGER = 0.65;         // seconds between each goat starting to cross
const TRIGGER_DIST = 50;      // world meters — herd starts crossing when car is within
const HERD_GAP_MIN = 200;
const HERD_GAP_MAX = 350;
const ROAD_HALF_WIDTH = 5;    // meters from road centre to each roadside

// Country road segments where goat herds cross unattended (Linstead–Moneague stretch).
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface Goat {
  obj: THREE.Group;
  start: THREE.Vector3;
  end: THREE.Vector3;
  delay: number;    // stagger countdown (seconds)
  progress: number; // 0..1 across the road
  done: boolean;
  hit: boolean;
  nearMissed: boolean;
}

interface Herd {
  goats: Goat[];
  triggered: boolean;
  ref: THREE.Vector3;
}

// Herds of 4 goats cross country roads with staggered timing (0.65 s apart).
// Hitting a goat: SCORE_PENALTY points + narrator scolding.
// Near-miss (within 4 m): lighter narrator comment.
export class Goats {
  readonly object: THREE.Group;
  private readonly herds: Herd[] = [];
  private penaltyTotal = 0;

  get score(): number { return this.penaltyTotal; }

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;

      let travelled = 0;
      let nextAt = HERD_GAP_MIN + rng() * (HERD_GAP_MAX - HERD_GAP_MIN);

      for (let i = seg.from + 1; i < seg.to; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);

        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const mid = a.clone().lerp(b, t);
          const dir = b.clone().sub(a).normalize();
          // perp points LEFT of the travel direction
          const perp = new THREE.Vector3(dir.z, 0, -dir.x);

          const goats: Goat[] = [];
          for (let g = 0; g < HERD_SIZE; g++) {
            // Slight along-road stagger so the herd isn't perfectly side-by-side
            const alongOffset = (rng() - 0.5) * 3;
            const start = mid.clone()
              .addScaledVector(dir, alongOffset)
              .addScaledVector(perp, ROAD_HALF_WIDTH);
            const end = mid.clone()
              .addScaledVector(dir, alongOffset)
              .addScaledVector(perp, -ROAD_HALF_WIDTH);
            start.y = 0;
            end.y = 0;

            const obj = makeGoat();
            obj.position.copy(start);
            // Face the crossing direction
            const crossDir = end.clone().sub(start).normalize();
            obj.rotation.y = Math.atan2(crossDir.x, crossDir.z);
            this.object.add(obj);

            goats.push({
              obj, start, end,
              delay: g * STAGGER,
              progress: 0,
              done: false,
              hit: false,
              nearMissed: false,
            });
          }

          this.herds.push({ goats, triggered: false, ref: mid.clone() });
          nextAt += HERD_GAP_MIN + rng() * (HERD_GAP_MAX - HERD_GAP_MIN);
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.goats.every((g) => g.done)) continue;

      if (!herd.triggered) {
        if (herd.ref.distanceToSquared(carPos) < TRIGGER_DIST * TRIGGER_DIST) {
          herd.triggered = true;
        } else {
          continue;
        }
      }

      for (const g of herd.goats) {
        if (g.done) continue;

        if (g.delay > 0) {
          g.delay -= dt;
          continue;
        }

        // Advance across the road
        const crossLen = g.start.distanceTo(g.end);
        g.progress = Math.min(1, g.progress + (CROSSING_SPEED * dt) / crossLen);
        g.obj.position.lerpVectors(g.start, g.end, g.progress);

        // Hit / near-miss detection
        const distSq = g.obj.position.distanceToSquared(carPos);
        if (!g.hit && distSq < HIT_RADIUS * HIT_RADIUS) {
          g.hit = true;
          this.penaltyTotal += SCORE_PENALTY;
          narrate('goat.hit');
        } else if (!g.nearMissed && !g.hit && distSq < NEAR_MISS_RADIUS * NEAR_MISS_RADIUS) {
          g.nearMissed = true;
          narrate('goat.near_miss');
        }

        if (g.progress >= 1) g.done = true;
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
