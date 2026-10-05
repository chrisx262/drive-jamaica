import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition layers:
//   1. Road callouts  — fires when the player turns onto a named road (HUD callout).
//   2. Community signs — fires when the player enters a community radius (sign + HUD).
//   3. Landmark popups — fires when the player nears a landmark (name + fact popup).
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private signEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideCallout: ReturnType<typeof setTimeout> | undefined;
  private hideSign: ReturnType<typeof setTimeout> | undefined;
  private hidePopup: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2 — community sign (positioned below the road callout)
    this.signEl = document.getElementById('community-sign')!;

    // Layer 3 — landmark popup
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

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
    // Layer 1: road name callout
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideCallout);
      this.hideCallout = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2: community signs
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.signEl.textContent = c.name;
      this.signEl.style.opacity = '1';
      clearTimeout(this.hideSign);
      this.hideSign = setTimeout(() => { this.signEl.style.opacity = '0'; }, 4500);
      narrate('community.enter', { community: c.name });
    }

    // Layer 3: landmark popups
    for (const l of this.landmarks) {
      if (l.shown || l.pos.distanceTo(carPos) > l.radius) continue;
      l.shown = true;
      this.popupEl.innerHTML = `\u{1F4CD} <b>${l.name}</b><br>${l.fact}`;
      this.popupEl.style.opacity = '1';
      clearTimeout(this.hidePopup);
      this.hidePopup = setTimeout(() => { this.popupEl.style.opacity = '0'; }, 5000);
      narrate('landmark.enter', { landmark: l.name });
    }
  }
}
