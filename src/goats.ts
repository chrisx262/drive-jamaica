import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const HIT_RADIUS = 2.2;      // m — car hits a goat
const NEAR_RADIUS = 5.0;     // m — close call (narrator comment)
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const SPREAD = 6;             // lateral spread of the herd across the road
const GOAT_SPEED = 2.5;      // m/s meandering across
const CROSS_DURATION = 12;   // s for the herd to fully cross

// Country-road segments where goat herds appear (Linstead–Moneague stretch).
const COUNTRY_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
  'McGrath Road',
]);

const SPAWN_GAP_MIN = 800;
const SPAWN_GAP_MAX = 2000;

interface GoatInstance {
  object: THREE.Group;
  pos: THREE.Vector3;
  dir: THREE.Vector3;   // crossing direction (perpendicular to road)
  tCross: number;       // seconds since herd started crossing
  hit: boolean;
  nearMissed: boolean;
}

interface Herd {
  goats: GoatInstance[];
  crossing: boolean;
  triggerPos: THREE.Vector3; // road centre point that wakes the herd
}

// Goat herds cross country roads unattended. Hitting one triggers a score
// penalty (tracked via hitsThisSession) and narrator scolding.
export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  hitsThisSession = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    let travelled = 0;
    let nextAt = SPAWN_GAP_MIN + rng() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const inCountry = seg ? COUNTRY_SEGMENTS.has(seg.name) : false;

      while (travelled + segLen >= nextAt) {
        if (inCountry) {
          const t = (nextAt - travelled) / segLen;
          const centre = a.clone().lerp(b, t);
          centre.y = 0;

          // Crossing direction: perpendicular to road, biased one way
          const roadDir = b.clone().sub(a).normalize();
          const perpSign = rng() > 0.5 ? 1 : -1;
          const crossDir = new THREE.Vector3(-roadDir.z, 0, roadDir.x).multiplyScalar(perpSign);

          const size = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const herd: Herd = { goats: [], crossing: false, triggerPos: centre.clone() };

          for (let g = 0; g < size; g++) {
            // Scatter goats across the road and slightly staggered in the crossing direction
            const lateral = (rng() - 0.5) * SPREAD;
            const lead = rng() * SPREAD * -0.5; // stagger along crossing dir
            const pos = centre.clone()
              .addScaledVector(roadDir, lateral)
              .addScaledVector(crossDir, lead - SPREAD * 0.5 - 2);
            const goat = makeGoat();
            goat.position.copy(pos);
            goat.rotation.y = Math.atan2(-crossDir.x, -crossDir.z) + (rng() - 0.5) * 0.3;
            this.object.add(goat);
            herd.goats.push({ object: goat, pos: pos.clone(), dir: crossDir.clone(), tCross: rng() * 2, hit: false, nearMissed: false });
          }

          this.herds.push(herd);
        }
        nextAt += SPAWN_GAP_MIN + rng() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      // Wake the herd when the car approaches the trigger point
      if (!herd.crossing) {
        if (herd.triggerPos.distanceToSquared(car.position) < 80 * 80) {
          herd.crossing = true;
        }
      }

      for (const g of herd.goats) {
        if (g.hit) continue;

        // Animate crossing
        if (herd.crossing && g.tCross < CROSS_DURATION) {
          g.tCross += dt;
          g.pos.addScaledVector(g.dir, GOAT_SPEED * dt);
          // Add a gentle bobble to simulate walking
          g.object.position.set(g.pos.x, Math.abs(Math.sin(g.tCross * 3)) * 0.08, g.pos.z);
          g.object.rotation.y += (Math.random() - 0.5) * 0.02;
        } else {
          g.object.position.copy(g.pos);
        }

        const distSq = g.pos.distanceToSquared(car.position);
        if (distSq < HIT_RADIUS * HIT_RADIUS) {
          g.hit = true;
          this.hitsThisSession++;
          // Visual feedback: push the goat off to the side
          const impulse = g.pos.clone().sub(car.position).normalize().multiplyScalar(6);
          impulse.y = 0;
          g.pos.add(impulse);
          g.object.position.copy(g.pos);
          narrate('goat.hit');
        } else if (!g.nearMissed && distSq < NEAR_RADIUS * NEAR_RADIUS) {
          g.nearMissed = true;
          narrate('goat.near');
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
