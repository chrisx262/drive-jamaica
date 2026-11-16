import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herd crossings on the Linstead–Moneague country road stretch.
// A herd lines up perpendicular to the road and walks across when the car
// approaches. Hitting a goat triggers a narrator scolding; a near-miss
// triggers a lighter comment.
//
// Public API: construct with road, call update(car, dt) each frame, add
// .object to the scene. Matches the potholes / dogs module pattern.

const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const CROSSING_SPEED = 1.6;      // m/s — unhurried goats
const TRIGGER_DIST = 55;          // m; car within this → herd starts crossing
const HIT_RADIUS = 1.8;           // m; car vs individual goat
const NEAR_MISS_RADIUS = 4.5;    // m; triggers lighter narrator comment
const HERD_GAP_MIN = 350;         // m between herds along the stretch
const HERD_GAP_MAX = 700;

// Segments where goats appear (country road between Linstead and Moneague)
const GOAT_SEGMENTS = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
];

interface Goat {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;    // crossing direction (perpendicular to road)
  crossing: boolean;
  crossed: boolean;      // finished crossing — no longer checked
}

interface Herd {
  goats: Goat[];
  triggerPos: THREE.Vector3;
  active: boolean;
  hitFired: boolean;
  nearMissFired: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(7373);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.some((s) => seg.name.includes(s))) continue;

      let travelled = 0;
      let nextAt = HERD_GAP_MIN * (0.3 + rng() * 0.7);

      for (let i = seg.from + 1; i < seg.to && i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const edgeLen = a.distanceTo(b);

        while (travelled + edgeLen > nextAt) {
          const t = (nextAt - travelled) / edgeLen;
          const dir = b.clone().sub(a).normalize();
          const perp = new THREE.Vector3(-dir.z, 0, dir.x);

          // Herd starts on one side, walks to the other
          const startSide = rng() < 0.5 ? 1 : -1;
          const crossDir = perp.clone().multiplyScalar(startSide);
          const roadCentre = a.clone().lerp(b, t);
          const herdStart = roadCentre.clone().addScaledVector(perp, startSide * 6);

          const count = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const goats: Goat[] = [];
          for (let g = 0; g < count; g++) {
            const offset = perp.clone().multiplyScalar((g - (count - 1) / 2) * 1.4);
            const pos = herdStart.clone().add(offset);
            pos.y = 0;

            const mesh = makeGoat();
            mesh.position.copy(pos);
            // Face in crossing direction
            mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
            this.object.add(mesh);
            goats.push({ mesh, pos: pos.clone(), dir: crossDir.clone(), crossing: false, crossed: false });
          }

          this.herds.push({
            goats,
            triggerPos: roadCentre.clone(),
            active: false,
            hitFired: false,
            nearMissFired: false,
          });

          nextAt += HERD_GAP_MIN + rng() * (HERD_GAP_MAX - HERD_GAP_MIN);
        }
        travelled += edgeLen;
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      // Start crossing when car approaches
      if (!herd.active && herd.triggerPos.distanceTo(car.position) < TRIGGER_DIST) {
        herd.active = true;
        for (const goat of herd.goats) goat.crossing = true;
      }

      if (!herd.active) continue;

      let allCrossed = true;
      for (const goat of herd.goats) {
        if (goat.crossed) continue;
        allCrossed = false;

        if (goat.crossing) {
          goat.pos.addScaledVector(goat.dir, CROSSING_SPEED * dt);
          goat.pos.y = 0;
          goat.mesh.position.copy(goat.pos);

          // Stop after crossing ~16 m (road width + margin)
          if (goat.pos.distanceTo(herd.triggerPos) > 16) {
            goat.crossing = false;
            goat.crossed = true;
          }
        }

        // Collision / near-miss checks
        const d = goat.pos.distanceTo(car.position);
        if (!herd.hitFired && d < HIT_RADIUS) {
          herd.hitFired = true;
          narrate('goat.hit');
        } else if (!herd.nearMissFired && !herd.hitFired && d < NEAR_MISS_RADIUS) {
          herd.nearMissFired = true;
          narrate('goat.near_miss');
        }
      }

      if (allCrossed) herd.active = false;
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
