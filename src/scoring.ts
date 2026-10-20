import * as THREE from 'three';
import type { Car } from './car';
import { narrate } from './narrator';

// Scoring V1: distance + pothole near-misses + tyre-burst penalties.
// Goat/cow penalty hook (addPenalty) is wired here so the goats module
// (arriving via a separate PR) can call it without touching main.ts.
//
// Design: 0.2 pts/m driven, +100 per near-miss, -200 per tyre burst.
// Score is floored at 0 in the HUD; internal can go negative.

const PTS_PER_METER = 0.2;
const PTS_NEAR_MISS = 100;
const PTS_TYRE_BURST = -200;
const NEAR_MISS_OUTER = 4.2;   // m — inner edge of near-miss zone
const NEAR_MISS_INNER = 1.45;  // m — outside hit radius (potholes.ts uses 1.4)
const MIN_SPEED_NEAR_MISS = 13; // m/s — only counts at pothole-burst risk speed
const MAX_FRAME_DELTA = 5;     // m — ignore teleports / scene jumps

export class Scoring {
  private readonly scoreEl: HTMLElement;

  private _score = 0;
  private _distance = 0; // metres driven
  private _tyreBursts = 0;
  private _nearMisses = 0;

  private prevPos: THREE.Vector3 | null = null;
  private readonly seenNearMiss = new Set<THREE.Vector3>();

  constructor(private readonly potholePositions: THREE.Vector3[]) {
    this.scoreEl = document.createElement('div');
    Object.assign(this.scoreEl.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '14px',
      textShadow: '0 1px 3px rgba(0,0,0,0.65)',
      userSelect: 'none',
      lineHeight: '1.5',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.scoreEl);
    this._render();
  }

  // Getters for debug overlay / end-screen
  get score(): number { return this._score; }
  get distance(): number { return this._distance; }
  get tyreBursts(): number { return this._tyreBursts; }
  get nearMisses(): number { return this._nearMisses; }

  // Called from main.ts when car.tyreBurst transitions false → true.
  onTyreBurst(): void {
    this._tyreBursts++;
    this._score += PTS_TYRE_BURST;
    this._render();
  }

  // General penalty hook: goats.ts (and future modules) call this.
  addPenalty(pts: number): void {
    this._score -= Math.abs(pts);
    this._render();
  }

  update(car: Car): void {
    const pos = car.position; // reference — clone before storing

    if (this.prevPos !== null) {
      const delta = pos.distanceTo(this.prevPos);
      if (delta < MAX_FRAME_DELTA) {
        this._distance += delta;
        this._score += delta * PTS_PER_METER;
      }
    }
    this.prevPos = pos.clone();

    // Near-miss: fast pass past a pothole within the outer halo
    if (Math.abs(car.speed) >= MIN_SPEED_NEAR_MISS) {
      for (const p of this.potholePositions) {
        if (this.seenNearMiss.has(p)) continue;
        const d = pos.distanceTo(p);
        if (d < NEAR_MISS_OUTER && d > NEAR_MISS_INNER) {
          this.seenNearMiss.add(p);
          this._nearMisses++;
          this._score += PTS_NEAR_MISS;
          narrate('near.miss');
        }
      }
    }

    this._render();
  }

  private _render(): void {
    const km = (this._distance / 1000).toFixed(1);
    const pts = Math.max(0, Math.round(this._score));
    this.scoreEl.textContent = `Score: ${pts}  ·  ${km} km`;
  }
}
