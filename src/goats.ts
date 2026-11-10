import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross the country road between Linstead and Moneague unattended.
// When the car approaches, the herd starts crossing; hitting one fires a narrator scolding.

const HIT_RADIUS = 1.8; // m — collision with individual goat
const CROSS_SPEED = 2.5; // m/s — goats amble, they do not hurry
const ROAD_HALF_WIDTH = 6; // m — goats cross this span (wider than road for realism)
const TRIGGER_RADIUS = 70; // m — start crossing when car is this close
const HERD_SIZE = 4; // goats per herd (a few extras feel natural, too many is chaos)
const MIN_HERD_GAP = 420; // route-point units between herds
const MAX_HERD_GAP = 900;

const GOAT_ZONE_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Ocho Rios Road',
]);

interface GoatInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  crossDir: THREE.Vector3;
  crossing: boolean;
  crossed: boolean;
  crossedDist: number;
}

interface Herd {
  goats: GoatInstance[];
  crossPt: THREE.Vector3;
  triggered: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    for (const seg of road.segments) {
      if (!GOAT_ZONE_SEGMENTS.has(seg.name)) continue;
      const ptCount = seg.to - seg.from;
      let offset = rng() * MIN_HERD_GAP;

      while (offset < ptCount) {
        const ptIdx = Math.min(seg.from + Math.floor(offset), road.points.length - 2);
        const pt = road.points[ptIdx];
        const nextPt = road.points[ptIdx + 1];
        if (!pt || !nextPt) break;

        const dir = nextPt.clone().sub(pt).normalize();
        // perp points "left" of the road direction (since we drive on the left)
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        const goats: GoatInstance[] = [];
        for (let i = 0; i < HERD_SIZE; i++) {
          // Start on the right shoulder (negative-perp side), staggered along the road
          const alongOff = (i - (HERD_SIZE - 1) / 2) * 1.6;
          const startPos = pt.clone()
            .addScaledVector(perp, -(ROAD_HALF_WIDTH + 2))
            .addScaledVector(dir, alongOff);
          startPos.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(startPos);
          // Face across the road (positive-perp direction)
          mesh.rotation.y = Math.atan2(perp.x, perp.z);
          this.object.add(mesh);

          goats.push({
            mesh,
            pos: startPos.clone(),
            crossDir: perp.clone(),
            crossing: false,
            crossed: false,
            crossedDist: 0,
          });
        }

        this.herds.push({
          goats,
          crossPt: pt.clone(),
          triggered: false,
        });

        offset += MIN_HERD_GAP + rng() * (MAX_HERD_GAP - MIN_HERD_GAP);
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      if (!herd.triggered && herd.crossPt.distanceTo(carPos) < TRIGGER_RADIUS) {
        herd.triggered = true;
        for (const g of herd.goats) g.crossing = true;
      }

      for (const g of herd.goats) {
        if (!g.crossing || g.crossed) continue;

        const step = CROSS_SPEED * dt;
        g.pos.addScaledVector(g.crossDir, step);
        g.crossedDist += step;
        g.mesh.position.copy(g.pos);

        // Done once they've walked across both lanes and the far verge
        if (g.crossedDist >= (ROAD_HALF_WIDTH + 2) * 2) {
          g.crossed = true;
          g.crossing = false;
          continue;
        }

        // Collision check
        if (g.pos.distanceTo(carPos) < HIT_RADIUS) {
          g.crossed = true;
          g.crossing = false;
          g.mesh.visible = false;
          narrate('goat.hit');
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
