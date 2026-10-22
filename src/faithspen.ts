import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import type { Scoring } from './scoring';
import { narrate } from './narrator';

// Faith's Pen: the legendary roadside cookshop strip on the Moneague plateau.
// Slowing to a near-stop within the trigger zone heals tyre damage, awards a
// score bonus, and fires a narrator line. One-time per session (GAME_SPEC:
// "skippable but the game makes it tempting").
//
// Owner note: the location is known — no needs_owner_review flag here. The
// cookshop strip is on the A1 between Moneague and Fern Gully.

const LAT = 18.2347;
const LON = -77.0951;
const TRIGGER_RADIUS = 220;   // compressed-world metres
const STOP_SPEED = 5;         // m/s — player must slow almost to a stop
const SCORE_BONUS = 500;      // pts awarded for the stop
const POPUP_MS = 6000;

export class FaithsPen {
  private readonly triggerPos: THREE.Vector3;
  private triggered = false;
  private inZone = false;
  private readonly popupEl: HTMLElement;

  constructor(road: Road, private readonly scoring: Scoring) {
    this.triggerPos = road.project(LAT, LON);

    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed',
      bottom: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 24px',
      borderRadius: '8px',
      background: 'rgba(160, 60, 0, 0.92)',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '15px',
      opacity: '0',
      transition: 'opacity 0.5s',
      pointerEvents: 'none',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);
  }

  update(car: Car): void {
    if (this.triggered) return;

    const dist = car.position.distanceTo(this.triggerPos);
    const entering = dist <= TRIGGER_RADIUS;

    if (!this.inZone && entering) {
      // Player just crossed into the Faith's Pen zone — show approach hint
      this.inZone = true;
      this._showHint('Faith\'s Pen ahead — slow down for jerk chicken!');
    } else if (this.inZone && !entering) {
      this.inZone = false;
      this._clearHint();
    }

    if (entering && Math.abs(car.speed) <= STOP_SPEED) {
      this.triggered = true;
      if (car.tyreBurst) car.repairTyre();
      this.scoring.addBonus(SCORE_BONUS);
      narrate('faithspen.stop');
      this._showHint('Faith\'s Pen stop! Tyre fixed + jerk chicken. +500 pts!');
      setTimeout(() => { this._clearHint(); }, POPUP_MS);
    }
  }

  private _showHint(text: string): void {
    this.popupEl.textContent = text;
    this.popupEl.style.opacity = '1';
  }

  private _clearHint(): void {
    this.popupEl.style.opacity = '0';
  }
}
