import * as THREE from 'three';
import type { Car } from './car';
import { narrate } from './narrator';

// Points per event (tunable in data — these are starter values).
const PTS_PER_100M = 10;       // keep moving earns baseline points
const PTS_NEAR_MISS = 50;      // dodged a hazard at speed
const PTS_SWERVE = 10;         // style bonus per deliberate swerve
const PTS_GOAT_SPARED = 75;    // mercy bonus for not hitting a goat
const PTS_GOAT_HIT = -150;     // narrator scolds; score hurts
const PTS_TYRE_BURST = -100;   // hitting a pothole

const SWERVE_STEER_THRESHOLD = 0.55;  // |steer| must peak above this
const SWERVE_STEER_RELEASE = 0.15;    // … then fall below this
const SWERVE_SPEED_MIN = 8;           // m/s — stationary wiggling doesn't count
const SWERVE_COOLDOWN_MS = 1200;

// Narrator fires once per milestone tier reached.
const MILESTONE_TIERS = [500, 1000, 2500, 5000, 10_000];

export interface ScoreSummary {
  total: number;
  distance: number;   // metres driven
  nearMisses: number;
  swerves: number;
  tyresBurst: number;
  goatsSpared: number;
  goatsHit: number;
}

export class Scoring {
  private pts = 0;
  private distanceM = 0;
  private nearMissCount = 0;
  private swerveCount = 0;
  private tyresBurstCount = 0;
  private goatsSparedCount = 0;
  private goatsHitCount = 0;

  private lastPos = new THREE.Vector3();
  private posInit = false;
  private lastSwerveMs = 0;
  private inSwerve = false;
  private milestoneTierIdx = 0;

  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '12px',
      right: '16px',
      padding: '5px 14px',
      borderRadius: '8px',
      background: 'rgba(0,0,0,0.58)',
      color: '#ffd700',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '17px',
      letterSpacing: '0.5px',
      userSelect: 'none',
      pointerEvents: 'none',
      transition: 'color 0.15s',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
    this._render();
  }

  update(car: Car, _dt: number): void {
    const pos = car.position;

    // Distance
    if (!this.posInit) {
      this.lastPos.copy(pos);
      this.posInit = true;
    }
    const moved = this.lastPos.distanceTo(pos);
    if (moved < 50) {
      this.distanceM += moved;
      this.pts += (moved / 100) * PTS_PER_100M;
    }
    this.lastPos.copy(pos);

    // Swerve detection: steer peaks past threshold then releases back
    const s = Math.abs(car.steerPos);
    if (!this.inSwerve && s > SWERVE_STEER_THRESHOLD) {
      this.inSwerve = true;
    } else if (this.inSwerve && s < SWERVE_STEER_RELEASE) {
      this.inSwerve = false;
      const now = performance.now();
      if (car.speed > SWERVE_SPEED_MIN && now - this.lastSwerveMs > SWERVE_COOLDOWN_MS) {
        this.swerveCount++;
        this.pts += PTS_SWERVE;
        this.lastSwerveMs = now;
      }
    }

    // Milestone narrator shout-out
    const tier = MILESTONE_TIERS[this.milestoneTierIdx];
    if (tier !== undefined && this.pts >= tier) {
      this.milestoneTierIdx++;
      narrate('score.milestone');
    }

    this._render();
  }

  onTyreBurst(): void {
    this.tyresBurstCount++;
    this.pts += PTS_TYRE_BURST;
    this._render();
  }

  onNearMiss(): void {
    this.nearMissCount++;
    this.pts += PTS_NEAR_MISS;
    narrate('score.near_miss');
    this._render();
  }

  onGoatSpared(): void {
    this.goatsSparedCount++;
    this.pts += PTS_GOAT_SPARED;
    narrate('score.goat_spared');
    this._render();
  }

  onGoatHit(): void {
    this.goatsHitCount++;
    this.pts += PTS_GOAT_HIT;
    this._render();
  }

  getScore(): ScoreSummary {
    return {
      total: Math.round(Math.max(0, this.pts)),
      distance: Math.round(this.distanceM),
      nearMisses: this.nearMissCount,
      swerves: this.swerveCount,
      tyresBurst: this.tyresBurstCount,
      goatsSpared: this.goatsSparedCount,
      goatsHit: this.goatsHitCount,
    };
  }

  private _render(): void {
    const score = Math.round(Math.max(0, this.pts));
    this.el.textContent = `${score.toLocaleString()} pts`;
  }
}
