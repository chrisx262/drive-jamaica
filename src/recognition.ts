import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate, hasEvent } from './narrator';


// Recognition system — three layers:
//   1. Road callouts: road-name HUD popup on segment change
//   2. Community signs: district name shown when entering a community
//   3. Landmark popups: prominent place name + one-line fact
// All data-driven from data/ JSON.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private popupEl: HTMLElement;
  private communityEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { id: string; name: string; pos: THREE.Vector3; radius: number; entered: boolean }[] = [];

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

    // Layer 2: community sign — styled like a Jamaican road sign (green border)
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '108px', left: '50%', transform: 'translateX(-50%)',
      padding: '5px 18px', borderRadius: '4px',
      border: '3px solid #1a7a1a',
      background: 'rgba(255,255,255,0.93)',
      color: '#1a1a1a', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '17px', letterSpacing: '0.04em',
      opacity: '0', transition: 'opacity 0.35s', userSelect: 'none',
      textAlign: 'center', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }

    for (const c of communitiesData.communities) {
      this.communities.push({ id: c.id, name: c.name, pos: road.project(c.lat, c.lon), radius: c.radius, entered: false });
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
      if (c.pos.distanceTo(carPos) <= c.radius) {
        if (!c.entered) {
          c.entered = true;
          this.communityEl.textContent = `→ ${c.name}`;
          this.communityEl.style.opacity = '1';
          clearTimeout(this.communityTimer);
          this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 4500);
          // Fire community-specific line if one exists; otherwise generic.
          const specificKey = `community.enter.${c.id}`;
          if (hasEvent(specificKey)) {
            narrate(specificKey, { community: c.name });
          } else {
            narrate('community.enter', { community: c.name });
          }
        }
      } else {
        // Reset when the player leaves so re-entry triggers again (e.g. u-turn)
        c.entered = false;
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
