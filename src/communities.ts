import * as THREE from 'three';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition layer 2: community signs.
// Triggers once per community per session when the car enters the radius.
export class Communities {
  private entries: { name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private signEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: Road) {
    this.signEl = document.createElement('div');
    Object.assign(this.signEl.style, {
      position: 'fixed',
      top: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 22px',
      borderRadius: '4px',
      background: '#1a6b1a',
      border: '3px solid #fff',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '18px',
      opacity: '0',
      transition: 'opacity 0.35s',
      userSelect: 'none',
      textAlign: 'center',
      letterSpacing: '0.06em',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.signEl);

    for (const c of communitiesData.communities) {
      this.entries.push({
        name: c.name,
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }
  }

  update(carPos: THREE.Vector3): void {
    for (const c of this.entries) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.signEl.textContent = c.name;
      this.signEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.signEl.style.opacity = '0'; }, 3500);
      narrate('community.enter', { community: c.name });
    }
  }
}
