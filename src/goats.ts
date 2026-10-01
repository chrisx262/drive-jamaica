import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herd crossing mechanic. Herds appear on country road segments
// (Linstead-Moneague stretch). Each herd crosses the road when the car
// approaches. Hitting a goat fires a narrator scolding.
// Score penalty hook is left for the scoring module (not yet on main).

export const GOAT_HIT_RADIUS = 1.2; // exported for debug overlay

const HERD_SIZE = 4;         // goats per herd
const CROSS_SPEED = 2.5;     // m/s
const TRIGGER_RADIUS = 150;  // metres — herd starts crossing when car is this close

// Country road segments where goat herds appear
const COUNTRY_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Ocho Rios Road',
]);

interface Herd {
  goats: THREE.Object3D[];
  positions: THREE.Vector3[];
  startSide: THREE.Vector3;
  endSide: THREE.Vector3;
  centerPoint: THREE.Vector3;
  crossDir: THREE.Vector3;
  progress: number;
  triggered: boolean;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(20261002);

    for (const seg of road.segments) {
      if (!COUNTRY_SEGMENTS.has(seg.name)) continue;
      let travelled = 0;
      let nextAt = 200 + rng() * 400;

      for (let i = seg.from + 1; i < seg.to; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);
        while (travelled + segLen >= nextAt) {
          const t = (nextAt - travelled) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Left perpendicular — goats cross from right (oncoming) to left (near lane)
          const leftPerp = new THREE.Vector3(-dir.z, 0, dir.x);
          const center = a.clone().lerp(b, t);
          center.y = 0;
          // Right side = start, left side = end (crossing toward player's lane)
          const halfRoad = 7;
          const startSide = center.clone().addScaledVector(leftPerp, -(halfRoad + 3));
          const endSide = center.clone().addScaledVector(leftPerp, halfRoad + 3);
          const crossDir = endSide.clone().sub(startSide).normalize();

          const goats: THREE.Object3D[] = [];
          const positions: THREE.Vector3[] = [];
          for (let g = 0; g < HERD_SIZE; g++) {
            const mesh = makeGoat();
            const spreadPerp = (rng() - 0.5) * 3;
            const spreadAlong = (rng() - 0.5) * 4;
            const pos = startSide.clone()
              .addScaledVector(leftPerp, spreadPerp)
              .addScaledVector(dir, spreadAlong);
            pos.y = 0;
            mesh.position.copy(pos);
            mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
            this.object.add(mesh);
            goats.push(mesh);
            positions.push(pos.clone());
          }
          this.herds.push({
            goats,
            positions,
            startSide,
            endSide,
            centerPoint: center.clone(),
            crossDir,
            progress: 0,
            triggered: false,
            hit: false,
          });
          nextAt += 200 + rng() * 400;
        }
        travelled += segLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.progress >= 1) continue;

      if (!herd.triggered) {
        if (herd.centerPoint.distanceToSquared(carPos) < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          herd.triggered = true;
        } else {
          continue;
        }
      }

      // Advance crossing
      const totalDist = herd.startSide.distanceTo(herd.endSide);
      herd.progress = Math.min(herd.progress + (CROSS_SPEED * dt) / totalDist, 1);

      for (let g = 0; g < herd.goats.length; g++) {
        // Stagger each goat slightly so they don't all cross in lockstep
        const goatProgress = THREE.MathUtils.clamp(herd.progress + (g - HERD_SIZE / 2) * 0.04, 0, 1);
        const newPos = herd.startSide.clone().lerp(herd.endSide, goatProgress);
        newPos.y = 0;
        herd.positions[g].copy(newPos);
        herd.goats[g].position.copy(newPos);
      }

      // Collision check — one narrate per herd
      if (!herd.hit) {
        for (const pos of herd.positions) {
          if (pos.distanceToSquared(carPos) < GOAT_HIT_RADIUS * GOAT_HIT_RADIUS) {
            herd.hit = true;
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
