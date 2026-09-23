import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system — three layers of place identification, all data-driven.
//   Layer 1: Road callouts — road name shown when player turns onto a new road.
//   Layer 2: Community signs — passing into a community/district shows its name
//            (white-panel Jamaican road sign style + HUD).
//   Layer 3: Landmark popups — prominent places show name + one-line fact.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private signEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private signTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2: community sign — styled as a Jamaican road sign (white panel, black border)
    this.signEl = document.createElement('div');
    Object.assign(this.signEl.style, {
      position: 'fixed', top: '50px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 22px', border: '3px solid #111',
      background: '#ffffff', color: '#111111',
      fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '17px', opacity: '0', transition: 'opacity 0.35s',
      userSelect: 'none', textAlign: 'center', borderRadius: '2px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.signEl);

    // Layer 3: landmark popup (dark pill, sits below the community sign)
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '96px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }

    for (const c of communitiesData.communities) {
      this.communities.push({ name: c.name, pos: road.project(c.lat, c.lon), radius: c.trigger_radius, shown: false });
    }
  }

  update(carPos: THREE.Vector3): void {
    // Layer 1: road callout
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2: community signs (one-shot per session — community sign stays in
    // data so the narrator line fires even on revisits in future versions)
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.signEl.textContent = c.name;
      this.signEl.style.opacity = '1';
      clearTimeout(this.signTimer);
      this.signTimer = setTimeout(() => { this.signEl.style.opacity = '0'; }, 4500);
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
