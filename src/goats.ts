import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const HERD_COUNT = 5;
const GOATS_PER_HERD = 4;
const TRIGGER_DIST = 80;  // m from herd centre to start crossing
const HIT_RADIUS = 1.1;   // m per-goat collision sphere radius
const CROSS_SPEED = 2.2;  // m/s perpendicular crossing speed
const CROSS_WIDTH = 14;   // m total crossing distance (road + verge)
const REPAIR_DELAY = 7_000; // ms, auto-repair tyre after goat impact
const ROAD_HALF = 4;      // half of ROAD_WIDTH (8 m) from road.ts
const ROADSIDE_GAP = 5;   // m beyond road edge where goats wait

// Goat herds cross country roads on the Linstead–Moneague stretch per GAME_SPEC.
// Each herd waits on the roadside, crosses when the car approaches, and the car
// can collide with crossing goats. Public API matches the pattern of Potholes.
export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  private hitThisSession = false;
  private repairTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(7331);

    // Only scatter on the Linstead–Moneague country-road segments (GAME_SPEC).
    const goatSegNames = new Set([
      'Linstead - Moneague Road',
      'Pleasant Farm Road',
    ]);
    const eligible: number[] = [];
    for (const seg of road.segments) {
      if (!goatSegNames.has(seg.name)) continue;
      // Avoid segment edges (needs valid prev/next for direction calc).
      for (let i = seg.from + 3; i < seg.to - 3; i++) eligible.push(i);
    }
    if (!eligible.length) return;

    for (let h = 0; h < HERD_COUNT; h++) {
      const idx = eligible[Math.floor(rng() * eligible.length)];
      const center = road.points[idx].clone();

      const prev = road.points[Math.max(0, idx - 1)];
      const next = road.points[Math.min(road.points.length - 1, idx + 1)];
      const dir = next.clone().sub(prev).normalize();
      // perp = left of road (driver's left for left-hand traffic)
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);

      // 60 % start on left roadside, 40 % on right.
      const startSide = rng() < 0.6 ? 1 : -1;
      const startDist = ROAD_HALF + ROADSIDE_GAP + rng() * 2;
      // crossDir: perpendicular movement vector while crossing.
      const crossDir = perp.clone().multiplyScalar(-startSide);
      // Goats face the direction they will walk.
      const crossRotY = Math.atan2(crossDir.x, crossDir.z);

      const group = new THREE.Group();
      const goatObjs: THREE.Object3D[] = [];
      for (let g = 0; g < GOATS_PER_HERD; g++) {
        const goat = makeGoat();
        // Spread goats along the road direction so they form a loose cluster.
        const along = (g - (GOATS_PER_HERD - 1) / 2) * 1.6;
        const lateral = startSide * (startDist + (rng() - 0.5) * 1.5);
        goat.position
          .copy(center)
          .addScaledVector(perp, lateral)
          .addScaledVector(dir, along);
        goat.rotation.y = crossRotY + (rng() - 0.5) * 0.4;
        group.add(goat);
        goatObjs.push(goat);
      }

      this.object.add(group);
      this.herds.push({
        group,
        goats: goatObjs,
        center,
        crossDir,
        state: 'waiting',
        crossed: 0,
        hit: false,
      });
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.state === 'done') continue;

      if (herd.state === 'waiting') {
        if (herd.center.distanceTo(car.position) < TRIGGER_DIST) {
          herd.state = 'crossing';
        }
        continue;
      }

      // state === 'crossing'
      const step = CROSS_SPEED * dt;
      herd.crossed += step;

      for (const g of herd.goats) {
        g.position.addScaledVector(herd.crossDir, step);
      }

      if (!herd.hit) {
        for (const g of herd.goats) {
          if (g.position.distanceTo(car.position) < HIT_RADIUS) {
            herd.hit = true;
            herd.state = 'done';
            car.burstTyre();
            clearTimeout(this.repairTimer);
            this.repairTimer = setTimeout(() => car.repairTyre(), REPAIR_DELAY);
            narrate(this.hitThisSession ? 'goat.hit' : 'goat.hit.first');
            this.hitThisSession = true;
            break;
          }
        }
      }

      if (herd.crossed >= CROSS_WIDTH) herd.state = 'done';
    }
  }
}

interface Herd {
  group: THREE.Group;
  goats: THREE.Object3D[];
  center: THREE.Vector3;
  crossDir: THREE.Vector3;
  state: 'waiting' | 'crossing' | 'done';
  crossed: number;
  hit: boolean;
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
