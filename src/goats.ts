import * as THREE from 'three';
import { makeGoat } from './animals';
import type { Car } from './car';
import type { Road } from './road';
import { narrate } from './narrator';

// Goat herds cross country roads in the Linstead–Moneague stretch
// (GAME_SPEC: "goat herds cross country roads unattended").
// Hitting one: score penalty + narrator scolding.
// Near-misses get a milder line.
const GOAT_SEGMENTS = new Set([
  'Main Road',
  'Linstead Bypass',
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

const HERD_SPACING_M = 1200;      // distance between herds
const GOATS_PER_HERD = 4;
const HERD_SPREAD = 5;            // metres lateral spread within a herd
const HIT_RADIUS = 1.8;           // metres
const NEAR_MISS_RADIUS = 4.5;
const CROSSING_SPEED = 1.8;       // m/s — slow, maddening
const CROSS_DISTANCE = 22;        // how far each goat crosses before stopping
const RESPAWN_INTERVAL = 35_000;  // ms between herds re-spawning across the road

interface HerdState {
  goats: THREE.Object3D[];
  origins: THREE.Vector3[];
  roadDir: THREE.Vector3;
  crossDir: THREE.Vector3;
  crossing: boolean;
  crossTimer: ReturnType<typeof setTimeout> | undefined;
  crossProgress: number[];  // metres each goat has crossed
}

export class Goats {
  readonly object: THREE.Group;
  private herds: HerdState[] = [];
  private scoreCallback: ((delta: number) => void) | undefined;

  constructor(road: Road, scoreCallback?: (delta: number) => void) {
    this.object = new THREE.Group();
    this.scoreCallback = scoreCallback;
    const rng = mulberry32(7777);

    const eligible: { pt: THREE.Vector3; dir: THREE.Vector3 }[] = [];
    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segmentAt(i - 1);
      if (!seg || !GOAT_SEGMENTS.has(seg.name)) continue;
      const a = road.points[i - 1];
      const b = road.points[i];
      const dir = b.clone().sub(a).normalize();
      eligible.push({ pt: a.clone().lerp(b, 0.5), dir });
    }

    let accum = 0;
    const spacing = HERD_SPACING_M;
    for (let i = 1; i < eligible.length; i++) {
      const prev = eligible[i - 1].pt;
      const curr = eligible[i].pt;
      accum += prev.distanceTo(curr);
      if (accum < spacing) continue;
      accum -= spacing;

      const { pt, dir } = eligible[i];
      // Cross direction is perpendicular to road (driver's right = goats start from roadside)
      const crossDir = new THREE.Vector3(-dir.z, 0, dir.x);
      // Start them off the road on one side
      const startLateral = crossDir.clone().multiplyScalar(-(8 + rng() * 4));

      const goats: THREE.Object3D[] = [];
      const origins: THREE.Vector3[] = [];

      for (let g = 0; g < GOATS_PER_HERD; g++) {
        const along = (rng() - 0.5) * HERD_SPREAD;
        const spread = (rng() - 0.5) * HERD_SPREAD;
        const pos = pt.clone()
          .addScaledVector(dir, along)
          .add(startLateral)
          .addScaledVector(crossDir, spread);
        pos.y = 0;
        const goat = makeGoat();
        goat.position.copy(pos);
        goat.rotation.y = Math.atan2(crossDir.x, crossDir.z) + (rng() - 0.5) * 0.4;
        this.object.add(goat);
        goats.push(goat);
        origins.push(pos.clone());
      }

      const herd: HerdState = {
        goats, origins, roadDir: dir.clone(), crossDir,
        crossing: false, crossTimer: undefined,
        crossProgress: new Array(GOATS_PER_HERD).fill(0),
      };

      // Stagger herd crossing events using a simple repeating interval
      const delay = rng() * RESPAWN_INTERVAL;
      herd.crossTimer = setTimeout(() => this.startCrossing(herd, rng), delay);
      this.herds.push(herd);
    }
  }

  private startCrossing(herd: HerdState, rng: () => number): void {
    herd.crossing = true;
    herd.crossProgress.fill(0);
    // Reset each goat to origin
    for (let g = 0; g < herd.goats.length; g++) {
      herd.goats[g].position.copy(herd.origins[g]);
      herd.goats[g].rotation.y = Math.atan2(herd.crossDir.x, herd.crossDir.z) + (rng() - 0.5) * 0.3;
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (!herd.crossing) continue;

      let allDone = true;
      for (let g = 0; g < herd.goats.length; g++) {
        if (herd.crossProgress[g] >= CROSS_DISTANCE) continue;
        allDone = false;

        const speed = CROSSING_SPEED * (0.8 + Math.random() * 0.4);
        herd.crossProgress[g] += speed * dt;
        herd.goats[g].position.addScaledVector(herd.crossDir, speed * dt);

        const distToCar = herd.goats[g].position.distanceTo(car.position);
        if (distToCar < HIT_RADIUS) {
          narrate('goat.hit');
          this.scoreCallback?.(-50);
          // Knock the goat aside
          herd.goats[g].position.addScaledVector(herd.crossDir, 3);
          herd.crossProgress[g] = CROSS_DISTANCE; // remove from road
        } else if (distToCar < NEAR_MISS_RADIUS && Math.random() < 0.08) {
          narrate('goat.nearMiss');
        }
      }

      if (allDone) {
        herd.crossing = false;
        clearTimeout(herd.crossTimer);
        herd.crossTimer = setTimeout(() => this.startCrossing(herd, mulberry32(Date.now())), RESPAWN_INTERVAL);
      }
    }
  }

  destroy(): void {
    for (const h of this.herds) clearTimeout(h.crossTimer);
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
