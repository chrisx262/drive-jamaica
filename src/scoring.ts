import * as THREE from 'three';
import type { Car } from './car';
import type { RoadLike } from './road';
import { narrate } from './narrator';

// Score weights
const DIST_PTS_PER_KM    = 10;
const SWERVE_PTS         = 25;
const TYRE_BURST_PENALTY = 50;
const GOAT_HIT_PENALTY   = 100;
const GOAT_SPARED_BONUS  = 30;

// Swerve: steering crosses zero above this speed and the deflection was large
const SWERVE_SPEED_MIN    = 15; // m/s
const SWERVE_MIN_DEFLECT  = 0.4; // absolute steer position before it counts
const SWERVE_DEBOUNCE_MS  = 2500;

// Route-end detection: within this distance of the last route point
const ROUTE_END_RADIUS = 100; // metres (compressed world)

export interface ScoreBreakdown {
  distanceKm: number;
  swerves: number;
  tyresBurst: number;
  goatsHit: number;
  goatsSpared: number; // set at route end
  total: number;
}

export class Scoring {
  private distanceTravelled = 0; // metres
  private swerveCount = 0;
  private tyresBurst = 0;
  private goatsHit = 0;

  private prevPos: THREE.Vector3 | null = null;
  private prevSteerSide = 0; // +1 or -1, tracks which side we were on
  private prevSteerAbs = 0;
  private lastSwerveTime = -Infinity;
  private prevTyreBurst = false;

  private routeEndPoint: THREE.Vector3;
  private routeEnded = false;

  private panelEl: HTMLElement;
  private scoreScreenEl: HTMLElement;

  constructor(road: RoadLike) {
    this.routeEndPoint = road.points[road.points.length - 1].clone();
    this.panelEl = this.buildPanel();
    this.scoreScreenEl = this.buildScoreScreen();
  }

  update(car: Car, _dt: number): void {
    if (this.routeEnded) return;

    // Distance accumulation
    if (this.prevPos) {
      this.distanceTravelled += car.position.distanceTo(this.prevPos);
    }
    this.prevPos = car.position.clone();

    // Tyre burst tracking: detect transition false→true
    if (!this.prevTyreBurst && car.tyreBurst) {
      this.tyresBurst++;
    }
    this.prevTyreBurst = car.tyreBurst;

    // Style swerve detection: fast full-width steer reversal
    const steer = car.steerPos;
    const absSteer = Math.abs(steer);
    const steerSide = steer > 0.15 ? 1 : steer < -0.15 ? -1 : 0;
    const now = performance.now();

    if (
      steerSide !== 0 &&
      steerSide !== this.prevSteerSide &&
      this.prevSteerAbs >= SWERVE_MIN_DEFLECT &&
      absSteer >= SWERVE_MIN_DEFLECT &&
      Math.abs(car.speed) >= SWERVE_SPEED_MIN &&
      now - this.lastSwerveTime > SWERVE_DEBOUNCE_MS
    ) {
      this.swerveCount++;
      this.lastSwerveTime = now;
      narrate('score.swerve');
    }

    this.prevSteerSide = steerSide !== 0 ? steerSide : this.prevSteerSide;
    this.prevSteerAbs = absSteer;

    // Route end detection
    if (car.position.distanceTo(this.routeEndPoint) < ROUTE_END_RADIUS) {
      this.endRun(0);
    }

    this.updatePanel();
  }

  // Called by main.ts when potholes bursts a tyre (car.tyreBurst flips true)
  // — already handled automatically via the tyreBurst state watch above,
  // but kept as an explicit hook for callers that want to trigger it directly.
  recordGoatHit(): void {
    this.goatsHit++;
  }

  endRun(totalGoatHerds: number): void {
    if (this.routeEnded) return;
    this.routeEnded = true;
    const goatsSpared = Math.max(0, totalGoatHerds - this.goatsHit);
    const breakdown = this.breakdown(goatsSpared);
    narrate('score.run_complete');
    this.showScoreScreen(breakdown);
  }

  breakdown(goatsSpared = 0): ScoreBreakdown {
    const distanceKm = this.distanceTravelled / 1000;
    const total = Math.max(0,
      Math.round(distanceKm) * DIST_PTS_PER_KM
      + this.swerveCount * SWERVE_PTS
      - this.tyresBurst * TYRE_BURST_PENALTY
      - this.goatsHit * GOAT_HIT_PENALTY
      + goatsSpared * GOAT_SPARED_BONUS
    );
    return { distanceKm, swerves: this.swerveCount, tyresBurst: this.tyresBurst, goatsHit: this.goatsHit, goatsSpared, total };
  }

  private currentScore(): number {
    return this.breakdown(0).total;
  }

  private updatePanel(): void {
    const km = (this.distanceTravelled / 1000).toFixed(1);
    const score = this.currentScore();
    this.panelEl.innerHTML = `<span style="font-size:11px;opacity:0.75">SCORE</span><br>${score.toLocaleString()}<br><span style="font-size:11px;opacity:0.75">${km} km</span>`;
  }

  private buildPanel(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '12px', right: '12px',
      padding: '8px 14px', borderRadius: '8px',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
      fontWeight: '700', fontSize: '20px',
      textAlign: 'right', lineHeight: '1.4',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    return el;
  }

  private showScoreScreen(b: ScoreBreakdown): void {
    const rows: [string, string][] = [
      ['Distance', `${b.distanceKm.toFixed(1)} km  ×${DIST_PTS_PER_KM}pts/km`],
      ['Style swerves', `${b.swerves}  ×${SWERVE_PTS}pts`],
      ['Tyres burst', `${b.tyresBurst}  −${TYRE_BURST_PENALTY}pts each`],
      ['Goats hit', `${b.goatsHit}  −${GOAT_HIT_PENALTY}pts each`],
      ['Goats spared', `${b.goatsSpared}  +${GOAT_SPARED_BONUS}pts each`],
    ];
    const rowsHtml = rows.map(([label, detail]) =>
      `<tr><td style="text-align:right;padding:4px 12px 4px 0;opacity:0.8">${label}</td><td style="padding:4px 0">${detail}</td></tr>`
    ).join('');

    this.scoreScreenEl.innerHTML = `
      <div style="font-size:28px;font-weight:900;margin-bottom:8px">🏁 Yuh reach Ochi!</div>
      <div style="font-size:48px;font-weight:900;color:#fed100;margin-bottom:16px">${b.total.toLocaleString()} pts</div>
      <table style="margin:0 auto;font-size:15px;border-collapse:collapse">${rowsHtml}</table>
      <div style="margin-top:20px;font-size:13px;opacity:0.6">Press R to drive again</div>
    `;
    this.scoreScreenEl.style.opacity = '1';
    this.scoreScreenEl.style.pointerEvents = 'auto';

    // R to restart
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') { location.reload(); window.removeEventListener('keydown', onKey); }
    };
    window.addEventListener('keydown', onKey);
  }

  private buildScoreScreen(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', inset: '0',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.82)',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      opacity: '0', pointerEvents: 'none',
      transition: 'opacity 0.6s',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    return el;
  }
}
