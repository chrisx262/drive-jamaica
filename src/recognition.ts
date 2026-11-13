import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system: all three layers.
// Layer 1 — road callouts (road name HUD on each new segment).
// Layer 2 — community signs (in-world district entry sign + HUD).
// Layer 3 — landmark popups (name + one-line fact).
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private popupEl: HTMLElement;
  private communityEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    // Community sign: green sign board style, slightly lower than the popup
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)',
      padding: '5px 18px', borderRadius: '4px', background: '#1a7a2e',
      border: '2px solid #fff', color: '#fff',
      fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '17px', opacity: '0', transition: 'opacity 0.4s', userSelect: 'none',
      textAlign: 'center', letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }

    for (const c of communitiesData.communities) {
      this.communities.push({ name: c.name, pos: road.project(c.lat, c.lon), radius: c.trigger_radius, shown: false });
    }
  }

  update(carPos: THREE.Vector3): void {
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    for (const l of this.landmarks) {
      if (l.shown || l.pos.distanceTo(carPos) > l.radius) continue;
      l.shown = true;
      this.popupEl.innerHTML = `\u{1F4CD} <b>${l.name}</b><br>${l.fact}`;
      this.popupEl.style.opacity = '1';
      clearTimeout(this.popupTimer);
      this.popupTimer = setTimeout(() => { this.popupEl.style.opacity = '0'; }, 5000);
      narrate('landmark.enter', { landmark: l.name });
    }

    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.communityEl.textContent = `\u{1F6A7} ${c.name}`;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 4500);
      narrate('community.enter', { community: c.name });
    }
  }
}
