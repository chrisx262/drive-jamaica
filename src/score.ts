import * as THREE from 'three';
import type { Car } from './car';
import { HIT_RADIUS } from './potholes';

// Recognition scoring:
//   distance × speed multiplier (1×–2×) — main points engine
//   near-miss (+100) — passed a pothole within 3× hit radius at danger speed
//   style (+25) — sustained hard steer at speed (swerving / carving corners)
//   tyre burst (−150) — pothole hit penalty
//   goat hit (−200) — forward-compat hook for when src/goats.ts lands

const NEAR_MISS_RADIUS = HIT_RADIUS * 3; // 4.2 m
const NEAR_MISS_MIN_SPEED = 13; // m/s (same threshold as pothole burst in potholes.ts)
const NEAR_MISS_BONUS = 100;
const BURST_PENALTY = 150;
const GOAT_HIT_PENALTY = 200;
const STYLE_STEER_THRESHOLD = 0.6; // abs(steerPos) to count as "hard steer"
const STYLE_MIN_SPEED = 10; // m/s (~36 km/h)
const STYLE_ACCUMULATE = 1.2; // seconds of sustained hard-steering → earn one bonus
const STYLE_BONUS = 25;
const FLASH_BONUS_DURATION = 1.5; // s
const FLASH_PENALTY_DURATION = 2.0; // s

export class Score {
  private pts = 0;
  private nearMissed = new Set<number>();
  private styleTimer = 0;
  private flashTimer = 0;

  private readonly scoreEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  // Pre-allocated to avoid per-frame allocations in update()
  private readonly _fwd = new THREE.Vector3();
  private readonly _toHole = new THREE.Vector3();

  constructor() {
    this.scoreEl = document.createElement('div');
    Object.assign(this.scoreEl.style, {
      position: 'fixed', top: '12px', right: '16px',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
      fontWeight: '700', fontSize: '22px',
      textShadow: '0 1px 3px rgba(0,0,0,0.6)',
      userSelect: 'none', textAlign: 'right',
      letterSpacing: '0.5px',
    } satisfies Partial<CSSStyleDeclaration>);
    this.scoreEl.textContent = '0';
    document.body.appendChild(this.scoreEl);

    this.flashEl = document.createElement('div');
    Object.assign(this.flashEl.style, {
      position: 'fixed', top: '40px', right: '16px',
      fontFamily: 'system-ui, sans-serif', fontWeight: '700', fontSize: '14px',
      opacity: '0', transition: 'opacity 0.15s',
      userSelect: 'none', textAlign: 'right',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.flashEl);
  }

  update(car: Car, potholesPositions: THREE.Vector3[], dt: number): void {
    const speed = Math.abs(car.speed);

    // Distance points: 1 pt/m, speed-weighted (×1 at 0 km/h → ×2 at 100 km/h)
    if (speed > 0.5) {
      this.pts += speed * dt * (1 + Math.min(car.speedKmh / 100, 1));
    }

    // Near-miss: pothole passed within NEAR_MISS_RADIUS at danger speed
    this._fwd.set(-Math.sin(car.heading), 0, -Math.cos(car.heading));
    for (let i = 0; i < potholesPositions.length; i++) {
      if (this.nearMissed.has(i)) continue;
      const dist = potholesPositions[i].distanceTo(car.position);
      if (dist > NEAR_MISS_RADIUS || speed < NEAR_MISS_MIN_SPEED) continue;
      // Only reward once the pothole is BEHIND the car (car has passed it)
      this._toHole.copy(potholesPositions[i]).sub(car.position);
      if (this._toHole.dot(this._fwd) >= 0) continue;
      this.nearMissed.add(i);
      this.pts += NEAR_MISS_BONUS;
      this._showFlash(`+${NEAR_MISS_BONUS} Near miss!`, '#fed100', FLASH_BONUS_DURATION);
    }

    // Style: sustained hard-steer at speed earns points
    if (Math.abs(car.steerPos) >= STYLE_STEER_THRESHOLD && speed >= STYLE_MIN_SPEED) {
      this.styleTimer += dt;
      if (this.styleTimer >= STYLE_ACCUMULATE) {
        this.styleTimer -= STYLE_ACCUMULATE;
        this.pts += STYLE_BONUS;
        this._showFlash(`+${STYLE_BONUS} Style!`, '#00d4ff', FLASH_BONUS_DURATION);
      }
    } else {
      this.styleTimer = Math.max(0, this.styleTimer - dt * 0.5);
    }

    // Decay flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashEl.style.opacity = '0';
    }

    this.scoreEl.textContent = Math.floor(this.pts).toLocaleString();
  }

  tyreBurst(): void {
    this.pts = Math.max(0, this.pts - BURST_PENALTY);
    this._showFlash(`−${BURST_PENALTY} Tyre bust!`, '#ff4444', FLASH_PENALTY_DURATION);
  }

  // Forward-compat: called by src/goats.ts once that module lands in main.
  goatHit(): void {
    this.pts = Math.max(0, this.pts - GOAT_HIT_PENALTY);
    this._showFlash(`−${GOAT_HIT_PENALTY} Yuh lick di goat!`, '#ff4444', FLASH_PENALTY_DURATION);
  }

  get total(): number {
    return Math.floor(this.pts);
  }

  private _showFlash(text: string, color: string, duration: number): void {
    this.flashEl.textContent = text;
    this.flashEl.style.color = color;
    this.flashEl.style.opacity = '1';
    this.flashTimer = duration;
  }
}
