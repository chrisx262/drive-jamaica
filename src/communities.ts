import * as THREE from 'three';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition layer 2: community signs. Shows a sign HUD when the player enters
// a community/district. Data-driven from data/communities.json.
export class Communities {
  private entries: { id: string; name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private signEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: Road) {
    this.signEl = document.createElement('div');
    Object.assign(this.signEl.style, {
      position: 'fixed',
      top: '32px',
      right: '20px',
      padding: '6px 18px',
      borderRadius: '4px',
      background: 'rgba(0,100,0,0.88)',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '17px',
      letterSpacing: '0.04em',
      opacity: '0',
      transition: 'opacity 0.35s',
      userSelect: 'none',
      border: '2px solid rgba(255,255,255,0.55)',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.signEl);

    for (const c of communitiesData.communities) {
      this.entries.push({
        id: c.id,
        name: c.name,
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }
  }

  update(carPos: THREE.Vector3): void {
    for (const e of this.entries) {
      if (e.shown || e.pos.distanceTo(carPos) > e.radius) continue;
      e.shown = true;
      this.signEl.textContent = e.name;
      this.signEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.signEl.style.opacity = '0'; }, 5000);
      narrate('community.enter', { community: e.name });
    }
  }
}
