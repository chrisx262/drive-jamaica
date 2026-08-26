import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system — three layers of place identity, all data-driven from data/.
// Layer 1: road callouts — segment name shown whenever the player turns onto a new road.
// Layer 2: community signs — district/community name as the car enters its radius.
// Layer 3: landmark popups — named place + one-line fact at defined coordinates.
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

    // Layer 3: landmark popup
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    // Layer 2: community sign — green highway-sign style
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '116px', left: '50%', transform: 'translateX(-50%)',
      padding: '7px 22px', borderRadius: '4px',
      background: '#1a5c1a', border: '3px solid #fff',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '17px', opacity: '0', transition: 'opacity 0.4s', userSelect: 'none',
      textAlign: 'center', letterSpacing: '0.05em', textTransform: 'uppercase',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({
        name: l.name, fact: l.fact,
        pos: road.project(l.lat, l.lon), radius: l.radius, shown: false,
      });
    }

    for (const c of communitiesData.communities) {
      this.communities.push({
        name: c.name,
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }
  }

  update(carPos: THREE.Vector3): void {
    // Layer 1: road callout on segment change
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2: community sign (shown once per community per session)
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.communityEl.textContent = `\u{1F4CD} ${c.name}`;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 5000);
      narrate('community.enter', { community: c.name });
    }

    // Layer 3: landmark popups
    for (const l of this.landmarks) {
      if (l.shown || l.pos.distanceTo(carPos) > l.radius) continue;
      l.shown = true;
      this.popupEl.innerHTML = `\u{1F4CD} <b>${l.name}</b><br>${l.fact}`;
      this.popupEl.style.opacity = '1';
      clearTimeout(this.popupTimer);
      this.popupTimer = setTimeout(() => { this.popupEl.style.opacity = '0'; }, 5000);
      narrate('landmark.enter', { landmark: l.name });
    }
  }
}
