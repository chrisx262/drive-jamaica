import type { Car } from './car';

// GAME_SPEC scoring dimensions: distance, near-misses, tyres burst, goats spared/hit.
// Singleton pattern matches narrator.ts — other modules import addScoringEvent().

export type ScoringEvent = 'tyre.burst' | 'dog.chase' | 'goat.hit' | 'goat.spared';

export interface ScoreState {
  distanceKm: number;
  tyresBurst: number;
  dogsChased: number;
  goatsHit: number;
  goatsSpared: number;
  total: number;
}

class Scoring {
  private distanceKm = 0;
  private tyresBurst = 0;
  private dogsChased = 0;
  private goatsHit = 0;
  private goatsSpared = 0;
  private prevPos: { x: number; z: number } | null = null;
  private hudEl: HTMLElement | null = null;

  init(): void {
    this.hudEl = document.createElement('div');
    Object.assign(this.hudEl.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      padding: '8px 14px',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.65)',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      lineHeight: '1.7',
      userSelect: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.hudEl);
  }

  addEvent(type: ScoringEvent): void {
    switch (type) {
      case 'tyre.burst':   this.tyresBurst++;   break;
      case 'dog.chase':    this.dogsChased++;    break;
      case 'goat.hit':     this.goatsHit++;      break;
      case 'goat.spared':  this.goatsSpared++;   break;
    }
  }

  update(car: Car): void {
    const pos = car.position;
    if (this.prevPos !== null) {
      const dx = pos.x - this.prevPos.x;
      const dz = pos.z - this.prevPos.z;
      this.distanceKm += Math.sqrt(dx * dx + dz * dz) / 1000;
    }
    this.prevPos = { x: pos.x, z: pos.z };

    if (this.hudEl) this.hudEl.innerHTML = this.buildHtml();
  }

  getScore(): ScoreState {
    const distPts    = Math.round(this.distanceKm * 10);
    const sparedPts  = this.goatsSpared * 50;
    const hitPenalty = this.goatsHit    * 100;
    const tyrePenalty = this.tyresBurst * 75;
    return {
      distanceKm:  this.distanceKm,
      tyresBurst:  this.tyresBurst,
      dogsChased:  this.dogsChased,
      goatsHit:    this.goatsHit,
      goatsSpared: this.goatsSpared,
      total: Math.max(0, distPts + sparedPts - hitPenalty - tyrePenalty),
    };
  }

  private buildHtml(): string {
    const km = this.distanceKm.toFixed(1);
    let html = `\u{1F4CD} ${km} km`;
    if (this.tyresBurst)  html += `<br>\u{1F6DE} ${this.tyresBurst} tyre${this.tyresBurst !== 1 ? 's' : ''} burst`;
    if (this.goatsSpared) html += `<br>\u{1F410} ${this.goatsSpared} goat${this.goatsSpared !== 1 ? 's' : ''} spared`;
    if (this.goatsHit)    html += `<br>⚠️ ${this.goatsHit} goat${this.goatsHit !== 1 ? 's' : ''} hit`;
    if (this.dogsChased)  html += `<br>\u{1F415} ${this.dogsChased} dog chase${this.dogsChased !== 1 ? 's' : ''}`;
    return html;
  }
}

export const scoring = new Scoring();

export function initScoring(): void {
  scoring.init();
}

export function addScoringEvent(type: ScoringEvent): void {
  scoring.addEvent(type);
}
