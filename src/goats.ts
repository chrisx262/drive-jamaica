import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross country roads unattended on the Linstead–Moneague stretch.
// Hitting one: score penalty (check .goatHits) + narrator scolding.
//
// Public API mirrors Potholes: construct with road, add .object to scene, call .update(car, dt).

const APPROACH_RADIUS = 28; // m — triggers herd crossing
const HIT_RADIUS = 1.6;     // m — counts as hitting a goat
const CROSS_SPEED = 2.2;    // m/s — goats amble
const HERD_MIN = 2;
const HERD_MAX = 4;
const CROSS_DIST = 16;      // world units — total crossing distance (wider than road)
const MIN_GAP = 900;
const MAX_GAP = 2200;

// Rural road segments where goat crossings happen.
const COUNTRY_SEGMENTS = new Set([
  'Sligoville Road',
  'Selassie Road',
  'Pleasant Farm Road',
  'Linstead - Moneague Road',
  'McGrath Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
  'Milford Road',
]);

interface GoatMember {
  mesh: THREE.Group;
  progress: number; // 0..1 across the road
  lagOffset: number; // seconds delay before this goat starts
}

interface Herd {
  members: GoatMember[];
  startPos: THREE.Vector3; // right-shoulder spawn point
  crossDir: THREE.Vector3; // unit vec pointing across road (leftward)
  triggered: boolean;
  crossTimer: number;     // counts up from 0 after trigger
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  goatHits = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9999);

    let nextAt = MIN_GAP;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !COUNTRY_SEGMENTS.has(seg.name)) {
        travelled += segLen;
        nextAt = Math.max(nextAt, travelled + MIN_GAP / 4);
        continue;
      }

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Cross perpendicular: perp points left of travel direction
        const perp = new THREE.Vector3(dir.z, 0, -dir.x);
        const roadCenter = a.clone().lerp(b, t);
        // Start on the right shoulder
        const startPos = roadCenter.clone().sub(perp.clone().multiplyScalar(7 + rng() * 2));

        const count = HERD_MIN + Math.floor(rng() * (HERD_MAX - HERD_MIN + 1));
        const members: GoatMember[] = [];
        for (let g = 0; g < count; g++) {
          const goat = makeGoat();
          // Line them up along the road direction with small spacing
          const along = dir.clone().multiplyScalar((g - (count - 1) / 2) * 1.4);
          goat.position.copy(startPos.clone().add(along));
          goat.rotation.y = Math.atan2(perp.x, perp.z) + (rng() - 0.5) * 0.35;
          this.object.add(goat);
          members.push({ mesh: goat, progress: 0, lagOffset: g * 0.4 });
        }
        this.herds.push({ members, startPos: startPos.clone(), crossDir: perp.clone(), triggered: false, crossTimer: 0 });
        nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      // Skip fully-crossed herds
      if (herd.triggered && herd.members.every((m) => m.progress >= 1)) continue;

      // Trigger when car comes close
      if (!herd.triggered) {
        for (const m of herd.members) {
          if (m.mesh.position.distanceTo(car.position) < APPROACH_RADIUS) {
            herd.triggered = true;
            break;
          }
        }
      }

      if (!herd.triggered) continue;

      herd.crossTimer += dt;

      for (const member of herd.members) {
        if (member.progress >= 1) continue;
        const effectiveTime = herd.crossTimer - member.lagOffset;
        if (effectiveTime <= 0) continue;

        member.progress = Math.min((effectiveTime * CROSS_SPEED) / CROSS_DIST, 1);
        member.mesh.position.x = herd.startPos.x + herd.crossDir.x * member.progress * CROSS_DIST;
        member.mesh.position.z = herd.startPos.z + herd.crossDir.z * member.progress * CROSS_DIST;
        member.mesh.position.y = Math.abs(Math.sin(performance.now() / 200 + member.lagOffset * 3)) * 0.1;

        if (member.mesh.position.distanceTo(car.position) < HIT_RADIUS) {
          this.goatHits++;
          narrate('goat.hit');
          member.progress = 1;
          member.mesh.position.y = -20; // scatter off screen
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
