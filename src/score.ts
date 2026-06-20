import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Scoring constants — tune here without touching game logic.
const DIST_PER_POINT = 5;       // points per route-point advanced
const TYRE_PENALTY = 500;       // per burst
const GOAT_PENALTY = 200;       // per goat hit (called by goats.ts when that PR lands)
const NEAR_MISS_BONUS = 150;    // per traffic near-miss (called by traffic.ts)
const STYLE_AWARD = 80;         // per style moment
const STYLE_STEER_MIN = 0.65;   // |steer| must exceed this for a style moment
const STYLE_SPEED_MIN = 16;     // m/s (≈58 km/h) minimum for style credit
const STYLE_COOLDOWN = 3.5;     // seconds between style awards
// Route completion: trigger finish when player advances past this many points.
// 819 = last 20 points — Dunn's River Falls area (839 total).
const FINISH_THRESHOLD = 819;
const HALFWAY = Math.floor(839 / 2); // ~419

export class Score {
  private highestIdx = 0;
  private distPoints = 0;       // locked-in distance points
  private stylePoints = 0;
  private penalties = 0;
  private bonuses = 0;

  private styleCooldown = 0;
  private halfwayFired = false;
  private finished = false;

  // Detect tyre-burst edge without coupling to Potholes internals.
  private prevTyreBurst = false;

  private el: HTMLElement;
  private finishEl: HTMLElement;

  constructor(private road: Road) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', top: '12px', right: '16px',
      padding: '4px 14px', borderRadius: '6px',
      background: 'rgba(0,0,0,0.6)',
      color: '#fed100', fontFamily: 'system-ui,sans-serif',
      fontWeight: '700', fontSize: '15px', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.el.textContent = '★ 0';
    document.body.appendChild(this.el);

    this.finishEl = document.createElement('div');
    Object.assign(this.finishEl.style, {
      display: 'none',
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff', fontFamily: 'system-ui,sans-serif',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.finishEl);
  }

  get total(): number {
    return Math.max(0, this.distPoints + this.stylePoints + this.bonuses - this.penalties);
  }

  // Public hooks — called by external mechanics (goats, traffic) when those PRs land.
  recordGoatHit(): void { this.penalties += GOAT_PENALTY; }
  recordNearMiss(): void { this.bonuses += NEAR_MISS_BONUS; }

  update(car: Car, dt: number): void {
    if (this.finished) return;

    // Advance route progress: scan up to 60 points ahead for nearby route node.
    // This is O(60) not O(839) — safe every frame.
    const pts = this.road.points;
    const horizon = Math.min(this.highestIdx + 60, pts.length - 1);
    for (let i = this.highestIdx + 1; i <= horizon; i++) {
      if (pts[i].distanceToSquared(car.position) < 625) { // within 25 wu
        this.highestIdx = i;
        this.distPoints = this.highestIdx * DIST_PER_POINT;
      }
    }

    // Detect tyre burst edge (avoid requiring Potholes to know about Score).
    if (car.tyreBurst && !this.prevTyreBurst) {
      this.penalties += TYRE_PENALTY;
    }
    this.prevTyreBurst = car.tyreBurst;

    // Style points: high-speed meaningful swerve.
    this.styleCooldown = Math.max(0, this.styleCooldown - dt);
    if (
      this.styleCooldown === 0 &&
      Math.abs(car.steerPos) >= STYLE_STEER_MIN &&
      car.speed >= STYLE_SPEED_MIN
    ) {
      this.stylePoints += STYLE_AWARD;
      this.styleCooldown = STYLE_COOLDOWN;
      narrate('score.style');
    }

    // Halfway milestone.
    if (!this.halfwayFired && this.highestIdx >= HALFWAY) {
      this.halfwayFired = true;
      narrate('score.halfway');
    }

    // Route completion.
    if (this.highestIdx >= FINISH_THRESHOLD) {
      this.showFinish();
    }

    this.el.textContent = `★ ${this.total.toLocaleString()}`;
  }

  private showFinish(): void {
    if (this.finished) return;
    this.finished = true;
    narrate('score.finish');

    const t = this.total;
    const grade = t >= 6000 ? '🔥 LEGEND — Dutty Tuff Driver!'
      : t >= 4000 ? '⭐ Irie — Natural Born Driver'
      : t >= 2000 ? '🟡 Not Bad — But Need Work'
      : '😬 Landlord Calling — Cyaan Drive';

    const breakdown = [
      `Distance: ${this.distPoints.toLocaleString()} pts`,
      `Style: ${this.stylePoints.toLocaleString()} pts`,
      this.bonuses > 0 ? `Near-misses: +${this.bonuses.toLocaleString()} pts` : '',
      this.penalties > 0 ? `Penalties: −${this.penalties.toLocaleString()} pts` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

    this.finishEl.innerHTML = `
      <div style="font-size:52px;margin-bottom:12px">🏁</div>
      <div style="font-size:28px;font-weight:900;color:#fed100;margin-bottom:4px">Dunn&#x27;s River Falls</div>
      <div style="font-size:16px;opacity:0.75;margin-bottom:20px">Yuh mek it, brethren!</div>
      <div style="font-size:64px;font-weight:900;color:#fed100;line-height:1;margin-bottom:8px">${t.toLocaleString()}</div>
      <div style="font-size:20px;margin-bottom:10px">${grade}</div>
      <div style="font-size:13px;opacity:0.65;margin-bottom:32px">${breakdown}</div>
      <button
        onclick="location.reload()"
        style="padding:12px 36px;font-size:18px;font-weight:700;background:#fed100;color:#000;border:none;border-radius:8px;cursor:pointer">
        Drive Again
      </button>
    `;
    this.finishEl.style.display = 'flex';
  }
}
