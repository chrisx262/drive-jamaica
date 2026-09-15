import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross country roads on the Linstead–Moneague stretch unattended.
// Hitting one: score penalty + narrator scolding (GAME_SPEC).
const GOAT_SEGS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

const CROSS_SPEED = 1.3; // world units/sec — unhurried goat pace
const HIT_RADIUS = 2.0;  // collision radius

// Exported for HUD — how many goats the player has hit this session.
export let goatHits = 0;

interface GoatEntry {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  hit: boolean;
}

// Goat-herd module. Public API matches the potholes.ts pattern.
export class Goats {
  readonly object: THREE.Group;
  private goats: GoatEntry[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(20260003);

    for (const seg of road.segments) {
      if (!GOAT_SEGS.has(seg.name)) continue;
      const span = seg.to - seg.from;
      if (span < 6) continue;
      const herdCount = Math.max(1, Math.floor(span / 40));

      for (let h = 0; h < herdCount; h++) {
        const idx = seg.from + Math.floor(((h + 0.5) / herdCount) * span);
        const p = road.points[idx];
        const next = road.points[Math.min(idx + 1, road.points.length - 1)];
        const dir = next.clone().sub(p).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const side = rng() < 0.5 ? 1 : -1;
        const crossDist = 16 + rng() * 4; // full crossing distance
        const along = -3 + rng() * 6;     // herd offset along-road
        const goatCount = 2 + Math.floor(rng() * 3); // 2–4 goats per herd

        for (let i = 0; i < goatCount; i++) {
          const spread = (i - goatCount / 2) * 2.0; // stagger goats along the road
          // Goats start mid-crossing (already partway across the road for immediate drama)
          const progress = 0.2 + rng() * 0.6;
          const start = p.clone()
            .addScaledVector(perp, side * (crossDist * 0.5 - progress * crossDist))
            .addScaledVector(dir, along + spread);
          const target = p.clone()
            .addScaledVector(perp, -side * crossDist * 0.5)
            .addScaledVector(dir, along + spread);

          const mesh = makeGoat();
          mesh.position.copy(start);
          // Face in the crossing direction
          const crossDir = perp.clone().multiplyScalar(-side);
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);
          this.goats.push({ mesh, pos: start.clone(), target, hit: false });
        }
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const g of this.goats) {
      if (g.hit) continue;

      if (g.pos.distanceTo(car.position) < HIT_RADIUS) {
        g.hit = true;
        g.mesh.visible = false;
        goatHits++;
        narrate('goat.hit');
        continue;
      }

      const toTarget = g.target.clone().sub(g.pos);
      const dist = toTarget.length();
      if (dist > 0.1) {
        const step = Math.min(CROSS_SPEED * dt, dist);
        g.pos.addScaledVector(toTarget.normalize(), step);
        g.mesh.position.copy(g.pos);
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
