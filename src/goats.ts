import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const HIT_RADIUS   = 1.8;   // m: goat collision
const CROSS_SPEED  = 1.5;   // m/s goat walking pace
const ROAD_CROSS   = 20;    // m: distance a herd walks before stopping
const APPROACH_DIST = 70;   // m: start crossing when car this close
const HERD_SPACING  = 420;  // approx m between herds

// Rural segments on the Linstead→Moneague stretch
function isRuralSegment(name: string): boolean {
  return (
    name.includes('Linstead') ||
    name.includes('Pleasant Farm') ||
    name.includes('McGrath') ||
    name.includes('Moneague - Golden Grove')
  );
}

interface Herd {
  goats: THREE.Object3D[];
  offsets: THREE.Vector3[];
  center: THREE.Vector3;
  dir: THREE.Vector3;
  crossed: number;
  active: boolean;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  score = 0;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);
    let travelled = 0;
    let nextAt = HERD_SPACING * 0.4;

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !isRuralSegment(seg.name)) {
        travelled += road.points[i - 1].distanceTo(road.points[i]);
        continue;
      }

      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const fwd = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const roadPt = a.clone().lerp(b, t);

        const startSide = rng() > 0.5 ? 1 : -1;
        const center = roadPt.clone().addScaledVector(perp, startSide * (6 + rng() * 4));
        const crossDir = perp.clone().multiplyScalar(-startSide);

        const count = 3 + (rng() > 0.5 ? 1 : 0);
        const goats: THREE.Object3D[] = [];
        const offsets: THREE.Vector3[] = [];
        for (let g = 0; g < count; g++) {
          const mesh = makeGoat();
          const off = new THREE.Vector3((rng() - 0.5) * 3.5, 0, (rng() - 0.5) * 3.5);
          mesh.position.copy(center).add(off);
          this.object.add(mesh);
          goats.push(mesh);
          offsets.push(off);
        }

        this.herds.push({ goats, offsets, center: center.clone(), dir: crossDir, crossed: 0, active: false, hit: false });
        nextAt += HERD_SPACING * (0.65 + rng() * 0.7);
      }

      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const h of this.herds) {
      if (h.crossed >= ROAD_CROSS) continue;

      if (!h.active && h.center.distanceTo(car.position) < APPROACH_DIST) {
        h.active = true;
      }
      if (!h.active) continue;

      const step = CROSS_SPEED * dt;
      h.crossed += step;
      h.center.addScaledVector(h.dir, step);

      for (let g = 0; g < h.goats.length; g++) {
        h.goats[g].position.copy(h.center).add(h.offsets[g]);
        h.goats[g].rotation.y = Math.atan2(-h.dir.x, -h.dir.z);
      }

      if (!h.hit) {
        for (const mesh of h.goats) {
          if (mesh.position.distanceTo(car.position) < HIT_RADIUS) {
            h.hit = true;
            this.score -= 50;
            narrate('goat.hit');
            break;
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
