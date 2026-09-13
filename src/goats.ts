import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const TRIGGER_DIST = 80;    // m — car approaches this close before herd starts crossing
const HIT_RADIUS = 1.8;     // m — collision distance with an individual goat
const CROSS_SPEED = 1.7;    // m/s — lazy goat amble
const CROSS_WIDTH = 18;     // m — total crossing distance (clears road + both verges)
const HERD_GAP_MIN = 300;   // m between herds
const HERD_GAP_RAND = 400;  // additional random range on top of min
const BASE_COUNT = 3;       // goats per herd (Base_COUNT ± 1 random)

// Route point-index range covering the Linstead→Moneague country stretch.
// Covers: Linstead-Moneague Road (391-403, 458-628),
//         Pleasant Farm Road (403-446), McGrath Road (446-458).
const GOAT_ZONE = { from: 391, to: 628 };

interface GoatState {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  crossDir: THREE.Vector3;
  crossed: number;
  active: boolean;
  hit: boolean;
}

interface HerdState {
  goats: GoatState[];
  triggerPos: THREE.Vector3;
  triggered: boolean;
  hitNarrated: boolean;
}

// Goat herds on country roads. Each herd waits off-road until the car approaches,
// then crosses. Hitting a goat fires the narrator once per herd.
export class Goats {
  readonly object: THREE.Group;
  private herds: HerdState[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const cumDist: number[] = [0];
    for (let i = 1; i < road.points.length; i++) {
      cumDist.push(cumDist[i - 1] + road.points[i - 1].distanceTo(road.points[i]));
    }

    const zoneStart = cumDist[GOAT_ZONE.from];
    const zoneEnd = cumDist[Math.min(GOAT_ZONE.to, road.points.length - 1)];
    let nextAt = zoneStart + HERD_GAP_MIN * 0.5;

    for (let i = GOAT_ZONE.from + 1; i < GOAT_ZONE.to && i < road.points.length; i++) {
      while (cumDist[i] >= nextAt && nextAt < zoneEnd) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segDist = cumDist[i] - cumDist[i - 1];
        const t = segDist > 0 ? (nextAt - cumDist[i - 1]) / segDist : 0;
        const roadDir = b.clone().sub(a).normalize();
        const trigger = a.clone().lerp(b, t);
        trigger.y = 0;

        // Perpendicular to road — goats cross left→right or right→left
        const perp = new THREE.Vector3(roadDir.z, 0, -roadDir.x);
        const crossSide = rng() > 0.5 ? 1 : -1;
        const crossDir = perp.clone().multiplyScalar(-crossSide);

        const count = BASE_COUNT + (rng() > 0.5 ? 1 : -1);
        const goats: GoatState[] = [];

        for (let g = 0; g < count; g++) {
          const lateralOffset = crossSide * (5 + rng() * 2);
          const forwardOffset = (g - count / 2) * 1.8 + (rng() - 0.5) * 1.2;
          const pos = trigger.clone()
            .addScaledVector(perp, lateralOffset)
            .addScaledVector(roadDir, forwardOffset);
          pos.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);

          goats.push({ mesh, pos: pos.clone(), crossDir: crossDir.clone(), crossed: 0, active: false, hit: false });
        }

        this.herds.push({ goats, triggerPos: trigger.clone(), triggered: false, hitNarrated: false });
        nextAt += HERD_GAP_MIN + rng() * HERD_GAP_RAND;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      // Performance guard: skip herds far from the car
      if (!herd.triggered && herd.triggerPos.distanceTo(carPos) > TRIGGER_DIST * 2) continue;

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
