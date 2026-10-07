import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system — three layers of place identification (all data-driven):
//   Layer 1: Road callouts — road name shown when the car turns onto a named road.
//   Layer 2: Community signs — in-world sign + HUD when entering a community/district.
//   Layer 3: Landmark popups — name + one-line fact for prominent places.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private popupEl: HTMLElement;
  private communityEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; pos: THREE.Vector3; shown: boolean }[] = [];

  // Community sign detection radius in world units (compressed scale: ~80 m)
  private static readonly COMMUNITY_RADIUS = 80;

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

    // Community sign: green roadside-sign style banner
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '120px', left: '50%', transform: 'translateX(-50%)',
      padding: '8px 22px', borderRadius: '4px',
      background: '#1a5c1a', border: '3px solid #f5c518',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '18px', opacity: '0', transition: 'opacity 0.35s', userSelect: 'none',
      textAlign: 'center', letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({
        name: l.name, fact: l.fact,
        pos: road.project(l.lat, l.lon),
        radius: l.radius, shown: false,
      });
    }

    for (const c of communitiesData.communities) {
      this.communities.push({
        name: c.name,
        pos: road.project(c.lat, c.lon),
        shown: false,
      });
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

    // Layer 2: community signs
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > Recognition.COMMUNITY_RADIUS) continue;
      c.shown = true;
      this.communityEl.textContent = `\u{1F4CD} ${c.name}`;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 4500);
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
