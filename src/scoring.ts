import * as THREE from 'three';
import type { Car } from './car';
import type { Goats } from './goats';
import { HIT_RADIUS } from './potholes';

// Near-miss: car passes within this radius of a pothole above burst speed
// without hitting it (outside HIT_RADIUS). Rewards skill.
const NEAR_MISS_RADIUS = HIT_RADIUS * 3.5;
const BURST_SPEED_MS = 13; // m/s — must match potholes.ts BURST_SPEED

// Point values — tunable after owner play-testing.
const PTS_PER_100M = 10;
const PTS_NEAR_MISS = 50;
const PTS_TYRE_BURST = -30;
const PTS_GOAT_HIT = -25;

export interface ScoreSnapshot {
  distanceM: number;
  tyreBursts: number;
  goatHits: number;
  nearMisses: number;
  points: number;
}

// Scoring module. Public API: construct once, call update() each frame,
// call snapshot() to read the current score (e.g. for HUD / end screen).
export class Scoring {
  private distanceM = 0;
  private tyreBursts = 0;
  private nearMisses = 0;
  private prevTyreBurst = false;
  private nearMissedPotholes = new Set<THREE.Vector3>();
  private prevPos: THREE.Vector3 | null = null;

  // potholePositions: same array reference as Potholes.positions — no copy needed.
  update(car: Car, potholePositions: THREE.Vector3[]): void {
    // Distance
    if (this.prevPos) this.distanceM += this.prevPos.distanceTo(car.position);
    this.prevPos = car.position.clone();

    // Tyre burst — count leading edge only (false → true transition)
    if (!this.prevTyreBurst && car.tyreBurst) this.tyreBursts++;
    this.prevTyreBurst = car.tyreBurst;

    // Near-misses: in the hazard band around a pothole at speed, without hitting
    if (Math.abs(car.speed) >= BURST_SPEED_MS) {
      for (const p of potholePositions) {
        if (this.nearMissedPotholes.has(p)) continue;
        const d = p.distanceTo(car.position);
        if (d < NEAR_MISS_RADIUS && d > HIT_RADIUS) {
          this.nearMissedPotholes.add(p);
          this.nearMisses++;
        }
      }
    }
  }

  // Goat hits are read at snapshot time from the Goats instance (they only increase).
  snapshot(goats: Goats | null): ScoreSnapshot {
    const goatHits = goats?.goatHits ?? 0;
    const points = Math.max(
      0,
      Math.round(
        (this.distanceM / 100) * PTS_PER_100M +
          this.nearMisses * PTS_NEAR_MISS +
          this.tyreBursts * PTS_TYRE_BURST +
          goatHits * PTS_GOAT_HIT,
      ),
    );
    return { distanceM: this.distanceM, tyreBursts: this.tyreBursts, goatHits, nearMisses: this.nearMisses, points };
  }
}
