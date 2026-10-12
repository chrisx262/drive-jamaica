import * as THREE from 'three';
import type { Car } from './car';
import type { Potholes } from './potholes';
import type { Goats } from './goats';
import type { FaithsPen } from './faithspen';
import { HIT_RADIUS } from './potholes';

// Scoring model per GAME_SPEC: distance, near-misses (style), tyres burst, goats spared/hit,
// Faith's Pen stop bonus. Read-only from outside — game events mutate state via update().
// Score is always a non-negative integer.

const NEAR_MISS_RADIUS = 4.5;  // closer than this (but outside HIT_RADIUS) counts as near-miss
const NEAR_MISS_SPEED  = 10;   // m/s minimum — slow crawl doesn't count as skill

const PTS_PER_KM        = 100;
const PTS_NEAR_MISS     = 50;
const PTS_GOAT_SPARED   = 25;   // per herd completed without a hit
const PTS_TYRE_BURST    = -200;
const PTS_GOAT_HIT      = -150;
const PTS_FAITHS_PEN    = 300;  // bonus for pulling over at Faith's Pen

export class Scoring {
  private _distance = 0;        // cumulative world-meters
  private _nearMisses = 0;
  private _tyreBursts = 0;
  private _prevTyreBurst = false;
  private _prevPos: THREE.Vector3 | null = null;
  private _nearMissed = new Set<number>(); // pothole indices already credited

  constructor(
    private car: Car,
    private potholes: Potholes,
    private goats: Goats,
    private faithsPen: FaithsPen | null = null,
  ) {}

  update(_dt: number): void {
    // Distance traveled
    if (this._prevPos !== null) {
      this._distance += this._prevPos.distanceTo(this.car.position);
    }
    this._prevPos = this.car.position.clone();

    // Tyre burst transitions (false → true)
    if (this.car.tyreBurst && !this._prevTyreBurst) {
      this._tyreBursts++;
    }
    this._prevTyreBurst = this.car.tyreBurst;

    // Near-misses: fast pass within NEAR_MISS_RADIUS but outside HIT_RADIUS
    if (Math.abs(this.car.speed) >= NEAR_MISS_SPEED) {
      for (let i = 0; i < this.potholes.positions.length; i++) {
        if (this._nearMissed.has(i)) continue;
        const d = this.potholes.positions[i].distanceTo(this.car.position);
        if (d < NEAR_MISS_RADIUS && d > HIT_RADIUS) {
          this._nearMisses++;
          this._nearMissed.add(i);
        }
      }
    }
  }

  get score(): number {
    const goatHits = this.goats.hitCount;
    const goatsSpared = Math.max(0, this.goats.herdCount - goatHits);
    const faithBonus = this.faithsPen?.stopped ? PTS_FAITHS_PEN : 0;
    return Math.max(0, Math.round(
      (this._distance / 1000) * PTS_PER_KM +
      this._nearMisses * PTS_NEAR_MISS +
      goatsSpared * PTS_GOAT_SPARED +
      this._tyreBursts * PTS_TYRE_BURST +
      goatHits * PTS_GOAT_HIT +
      faithBonus,
    ));
  }

  get distanceKm(): number { return this._distance / 1000; }
  get nearMisses(): number { return this._nearMisses; }
  get tyreBursts(): number { return this._tyreBursts; }
  get goatHits(): number { return this.goats.hitCount; }
  get goatsSpared(): number { return Math.max(0, this.goats.herdCount - this.goats.hitCount); }
}
