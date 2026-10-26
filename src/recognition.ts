import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system: three layers of place identification (all data-driven).
// Layer 1 — road callouts: road name shown on each new segment.
// Layer 2 — community signs: entering a named community/district.
// Layer 3 — landmark popups: notable places with a one-line fact.
export class Recognition {
  private currentRoad: string | undefined;
  private currentCommunity: string | undefined;
  private calloutEl: HTMLElement;
  private communitySignEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { id: string; name: string; pos: THREE.Vector3; radius: number }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;
    this.communitySignEl = document.getElementById('community-sign')!;

    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '110px', left: '50%', transform: 'translateX(-50%)',
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
      this.communities.push({ id: c.id, name: c.name, pos: road.project(c.lat, c.lon), radius: c.radius });
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

    // Layer 2: community sign — show the nearest community the car is inside
    let nearestCommunity: string | undefined;
    let nearestDist = Infinity;
    for (const c of this.communities) {
      const d = c.pos.distanceTo(carPos);
      if (d < c.radius && d < nearestDist) {
        nearestDist = d;
        nearestCommunity = c.name;
      }
    }
    if (nearestCommunity !== this.currentCommunity) {
      this.currentCommunity = nearestCommunity;
      if (nearestCommunity) {
        this.communitySignEl.textContent = nearestCommunity;
        this.communitySignEl.style.opacity = '1';
        clearTimeout(this.communityTimer);
        this.communityTimer = setTimeout(() => { this.communitySignEl.style.opacity = '0'; }, 5000);
        narrate('community.enter', { community: nearestCommunity });
      } else {
        this.communitySignEl.style.opacity = '0';
      }
    }

    // Layer 3: landmark popup (one-shot per session)
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
