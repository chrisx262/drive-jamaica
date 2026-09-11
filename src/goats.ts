import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herd crossings on the Linstead→Moneague country stretch.
const CROSSING_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

const HERD_GAP     = 350;  // m between herds
const BASE_COUNT   = 3;    // goats per herd (±1 random)
const TRIGGER_DIST = 80;   // m — car approaches, herd starts crossing
const HIT_RADIUS   = 1.8;  // m — collision with a goat
const CROSS_SPEED  = 1.7;  // m/s — lazy goat amble
const CROSS_WIDTH  = 18;   // m total crossing distance (past the road and verge)

interface GoatState {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  crossDir: THREE.Vector3; // unit perpendicular to road
  crossed: number;         // distance crossed so far (m)
  active: boolean;
  hit: boolean;
}

interface HerdState {
  goats: GoatState[];
  triggerPos: THREE.Vector3;
  triggered: boolean;
  hitNarrated: boolean; // narrator fires once per herd
}

// Goat herds scattered on country roads. Herds stand idle until the car
// approaches, then cross the road. Hitting one triggers a narrator scolding.
export class Goats {
  readonly object: THREE.Group;
  private herds: HerdState[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const crossIdx = new Set<number>();
    for (const seg of road.segments) {
      if (CROSSING_SEGMENTS.has(seg.name)) {
        for (let i = seg.from; i < seg.to; i++) crossIdx.add(i);
      }
    }

    let crossDist = 0;
    let nextAt = HERD_GAP / 2;

    for (let i = 1; i < road.points.length; i++) {
      if (!crossIdx.has(i - 1)) continue;
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (crossDist + segLen >= nextAt) {
        const t = (nextAt - crossDist) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Perpendicular to road (left side when driving forward)
        const perp = new THREE.Vector3(dir.z, 0, -dir.x);
        const trigger = a.clone().lerp(b, t);

        // All goats in a herd cross the same way (left→right or right→left)
        const crossSide = rng() > 0.5 ? 1 : -1;
        const crossDir = perp.clone().multiplyScalar(-crossSide); // toward opposite verge

        const count = BASE_COUNT + (rng() > 0.5 ? 1 : -1);
        const goats: GoatState[] = [];

        for (let g = 0; g < count; g++) {
          // Start off-road on the departure side, staggered along the route
          const lateralOffset = crossSide * (5 + rng() * 2);
          const forwardOffset = (g - count / 2) * 1.8 + (rng() - 0.5) * 1.2;
          const pos = trigger.clone()
            .addScaledVector(perp, lateralOffset)
            .addScaledVector(dir, forwardOffset);
          pos.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(pos);
          // Face in the crossing direction (atan2(-fwdX, -fwdZ) convention)
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);

          goats.push({
            mesh,
            pos: pos.clone(),
            crossDir: crossDir.clone(),
            crossed: 0,
            active: false,
            hit: false,
          });
        }

        this.herds.push({ goats, triggerPos: trigger.clone(), triggered: false, hitNarrated: false });
        nextAt += HERD_GAP * (0.8 + rng() * 0.4);
      }
      crossDist += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      if (!herd.triggered) {
        if (herd.triggerPos.distanceTo(carPos) < TRIGGER_DIST) {
          herd.triggered = true;
          for (const g of herd.goats) g.active = true;
        }
        continue;
      }

      for (const g of herd.goats) {
        if (!g.active) continue;

        if (g.crossed < CROSS_WIDTH) {
          const step = CROSS_SPEED * dt;
          g.pos.addScaledVector(g.crossDir, step);
          g.mesh.position.copy(g.pos);
          g.crossed += step;
        } else {
          g.active = false;
          continue;
        }

        if (!g.hit && !herd.hitNarrated) {
          const dx = carPos.x - g.pos.x;
          const dz = carPos.z - g.pos.z;
          if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS) {
            g.hit = true;
            herd.hitNarrated = true;
            narrate('goat.hit');
          }
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
