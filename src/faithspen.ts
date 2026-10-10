import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Faith's Pen: the famous roadside cookshop stop on the Moneague → Ocho Rios
// stretch. Pull over (slow to a crawl for a moment) and the tyre gets a free
// repair + narrator celebration. Skippable, but the game nudges you.
// One-time event per session.

const LAT = 18.2347;
const LON = -77.0951;

const PROMPT_RADIUS = 160;  // world-meters — HUD prompt appears
const TRIGGER_RADIUS = 90;  // must be inside here to count
const STOP_SPEED_KMH = 12;  // km/h — slower than this counts as "pulling over"
const STOP_SECS = 2.5;      // consecutive seconds under speed threshold to trigger

export class FaithsPen {
  readonly worldPos: THREE.Vector3;
  private promptEl: HTMLElement;
  private toastEl: HTMLElement;
  private slowSecs = 0;
  private _stopped = false;
  private _skipped = false;
  private _wasInRange = false;

  constructor(road: Road) {
    this.worldPos = road.project(LAT, LON);

    this.promptEl = document.createElement('div');
    Object.assign(this.promptEl.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      padding: '8px 22px', borderRadius: '6px', background: 'rgba(160,50,0,0.88)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '16px', opacity: '0', transition: 'opacity 0.45s', userSelect: 'none',
      textAlign: 'center', border: '2px solid #fed100',
    } satisfies Partial<CSSStyleDeclaration>);
    this.promptEl.textContent = '🍗 Pull over — Faith\'s Pen jerk chicken!';
    document.body.appendChild(this.promptEl);

    this.toastEl = document.createElement('div');
    Object.assign(this.toastEl.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 24px', borderRadius: '8px', background: 'rgba(0,100,20,0.9)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '17px', opacity: '0', transition: 'opacity 0.4s', userSelect: 'none',
      textAlign: 'center', border: '2px solid #fed100',
    } satisfies Partial<CSSStyleDeclaration>);
    this.toastEl.textContent = '🍗 Jerk chicken an\' festival — tyre repaired! Enjoy!';
    document.body.appendChild(this.toastEl);
  }

  update(car: Car, dt: number): void {
    if (this._stopped) return;

    const dist = this.worldPos.distanceTo(car.position);
    const inPromptRange = dist < PROMPT_RADIUS;
    const inTriggerRange = dist < TRIGGER_RADIUS;

    // Show / hide the pull-over prompt
    if (inPromptRange && !this._wasInRange) {
      this.promptEl.style.opacity = '1';
    } else if (!inPromptRange && this._wasInRange && !this._skipped) {
      // Drove past without stopping
      this.promptEl.style.opacity = '0';
      this._skipped = true;
      narrate('faith.pen.skip');
    }
    this._wasInRange = inPromptRange;

    if (!inTriggerRange) {
      this.slowSecs = 0;
      return;
    }

    if (car.speedKmh < STOP_SPEED_KMH) {
      this.slowSecs += dt;
      if (this.slowSecs >= STOP_SECS) {
        this._stop(car);
      }
    } else {
      this.slowSecs = 0;
    }
  }

  private _stop(car: Car): void {
    this._stopped = true;
    this.promptEl.style.opacity = '0';
    car.repairTyre();
    narrate('faith.pen.stop');
    this.toastEl.style.opacity = '1';
    setTimeout(() => { this.toastEl.style.opacity = '0'; }, 5000);
  }

  get stopped(): boolean { return this._stopped; }
  get skipped(): boolean { return this._skipped; }
}
