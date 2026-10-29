import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system: layer 1 road callouts + layer 2 community signs + layer 3 landmark popups.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private signEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private signTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private communities: { name: string; pos: THREE.Vector3; shown: boolean }[] = [];
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2: community sign — styled like a green road sign
    this.signEl = document.createElement('div');
    Object.assign(this.signEl.style, {
      position: 'fixed', top: '104px', left: '50%', transform: 'translateX(-50%)',
      padding: '7px 22px 7px 18px', borderRadius: '4px',
      background: '#1a5e1a', border: '2px solid #c8b400',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '17px', letterSpacing: '0.04em',
      opacity: '0', transition: 'opacity 0.4s', userSelect: 'none',
      textAlign: 'center', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.signEl);

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

    // Pre-project community positions from lat/lon to world coords
    for (const c of communitiesData.communities) {
      this.communities.push({ name: c.name, pos: road.project(c.lat, c.lon), shown: false });
    }

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }
  }

  // Community sign trigger radius in world units (~300m in compressed-world scale)
  private static readonly COMMUNITY_RADIUS = 300;

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

    // Layer 2: community sign
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > Recognition.COMMUNITY_RADIUS) continue;
      c.shown = true;
      this.signEl.textContent = c.name;
      this.signEl.style.opacity = '1';
      clearTimeout(this.signTimer);
      this.signTimer = setTimeout(() => { this.signEl.style.opacity = '0'; }, 4500);
      narrate('community.enter', { community: c.name });
    }

    // Layer 3: landmark popup
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
