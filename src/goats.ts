import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';
import { makeGoat } from './animals';

// Goat herds on the Linstead–Moneague country stretch.
// Goats cross the road unpredictably; hitting one triggers a narrator scolding.
// Hitting multiple goats stacks the penalty counter.
// Public API mirrors potholes.ts: construct with RoadLike, call update(car, dt) each frame.

export const GOAT_HIT_RADIUS = 1.6; // meters — exported for debug overlay
const CROSS_SPEED = 1.8; // m/s (unhurried crossing)
const CROSS_INTERVAL_MIN = 15_000; // ms before a herd re-crosses
const CROSS_INTERVAL_MAX = 35_000;

// Segments where unattended goat herds cross (country road, hill stretch).
const GOAT_ZONES = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Ocho Rios Road',
]);

interface Goat {
  mesh: THREE.Group;
  roadPt: THREE.Vector3; // where it will cross
  dir: THREE.Vector3; // crossing direction (side to side)
  active: boolean; // currently crossing
  crossStart: number;
  nextCrossAt: number;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private goats: Goat[] = [];
  private _penaltyCount = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !GOAT_ZONES.has(seg.name)) continue;
      if (rng() > 0.04) continue; // sparse herds

      const a = road.points[i - 1];
      const b = road.points[i];
      const pt = a.clone().lerp(b, rng());
      pt.y = 0;

      const dir = b.clone().sub(a).normalize();
      // crossing direction is perpendicular to road
      const crossing = new THREE.Vector3(-dir.z, 0, dir.x);

      // offset starting position to one side
      const startPos = pt.clone().addScaledVector(crossing, -(10 + rng() * 4));
      startPos.y = 0;

      const mesh = makeGoat();
      mesh.position.copy(startPos);
      mesh.rotation.y = Math.atan2(crossing.x, crossing.z);
      mesh.visible = false; // hidden until it crosses
      this.object.add(mesh);

      this.goats.push({
        mesh,
        roadPt: pt.clone(),
        dir: crossing.clone(),
        active: false,
        crossStart: 0,
        nextCrossAt: performance.now() + rng() * 20_000, // staggered start
        hit: false,
      });
    }
  }

  get penaltyCount(): number { return this._penaltyCount; }

  update(car: Car, dt: number): void {
    const now = performance.now();

    for (const goat of this.goats) {
      if (goat.hit) continue;

      if (!goat.active) {
        if (now < goat.nextCrossAt) continue;
        // Only activate when the car is within a reasonable range (so goats appear relevant)
        if (goat.roadPt.distanceTo(car.position) > 220) continue;
        goat.active = true;
        goat.crossStart = now;
        // Reset to start side
        goat.mesh.position.copy(goat.roadPt).addScaledVector(goat.dir, -(10 + Math.random() * 4));
        goat.mesh.visible = true;
        goat.mesh.rotation.y = Math.atan2(goat.dir.x, goat.dir.z);
      }

      // Move across the road
      goat.mesh.position.addScaledVector(goat.dir, CROSS_SPEED * dt);

      const distCrossed = goat.mesh.position.distanceTo(
        goat.roadPt.clone().addScaledVector(goat.dir, -10)
      );
      if (distCrossed > 22) {
        // Made it across — schedule next crossing
        goat.active = false;
        goat.mesh.visible = false;
        goat.nextCrossAt = now + CROSS_INTERVAL_MIN + Math.random() * (CROSS_INTERVAL_MAX - CROSS_INTERVAL_MIN);
        continue;
      }

      // Collision check
      if (goat.mesh.position.distanceTo(car.position) < GOAT_HIT_RADIUS) {
        goat.hit = true;
        goat.active = false;
        goat.mesh.visible = false;
        this._penaltyCount++;
        narrate('goat.hit');
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
