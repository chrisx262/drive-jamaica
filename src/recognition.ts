import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system: all three layers.
//   Layer 1 — road callouts (road name on segment change)
//   Layer 2 — community signs (name popup as player enters a community)
//   Layer 3 — landmark popups (name + one-line fact)
export class Recognition {
  private currentRoad: string | undefined;
  private currentCommunity: string | undefined;
  private calloutEl: HTMLElement;
  private communityEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; pos: THREE.Vector3; radius: number }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2 — community sign: green-on-white, sits just below the road callout
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '44px', left: '50%', transform: 'translateX(-50%)',
      padding: '5px 18px', borderRadius: '4px',
      background: '#fff', color: '#1a6b20', border: '2px solid #1a6b20',
      fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '16px', opacity: '0', transition: 'opacity 0.4s', userSelect: 'none',
      textAlign: 'center', letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    // Layer 3 — landmark popup
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
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
      this.communities.push({ name: c.name, pos: road.project(c.lat, c.lon), radius: c.radius });
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

    // Layer 2: community signs — nearest community within its radius wins
    let nearestCommunity: { name: string; pos: THREE.Vector3; radius: number } | undefined;
    let nearestDist = Infinity;
    for (const c of this.communities) {
      const d = c.pos.distanceTo(carPos);
      if (d < c.radius && d < nearestDist) { nearestDist = d; nearestCommunity = c; }
    }
    const communityName = nearestCommunity?.name;
    if (communityName !== this.currentCommunity) {
      this.currentCommunity = communityName;
      if (communityName) {
        this.communityEl.textContent = `▶ ${communityName}`;
        this.communityEl.style.opacity = '1';
        clearTimeout(this.communityTimer);
        this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 5000);
        narrate('community.enter', { community: communityName });
      } else {
        this.communityEl.style.opacity = '0';
      }
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
