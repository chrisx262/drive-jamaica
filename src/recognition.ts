import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

type LandmarkEntry = { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean };
type CommunityEntry = { name: string; parish: string; note: string; pos: THREE.Vector3; radius: number; shown: boolean };

// Recognition system — three layers:
//   Layer 1: road callouts (road name HUD popup on segment change)
//   Layer 2: community signs (district/community entry sign + HUD popup)
//   Layer 3: landmark popups (name + one-line fact card)
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private communityEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: LandmarkEntry[] = [];
  private communities: CommunityEntry[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2 — community sign: green-bordered card, mid-screen left, styled like a
    // roadside district welcome sign. Distinct from road callout and landmark popup.
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '50%', left: '18px', transform: 'translateY(-50%)',
      padding: '8px 14px', borderRadius: '4px',
      background: 'rgba(20,80,30,0.88)', border: '2px solid #a8d878',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '14px', lineHeight: '1.3', opacity: '0',
      transition: 'opacity 0.4s', userSelect: 'none',
      maxWidth: '180px', textAlign: 'center',
      textShadow: '0 1px 3px rgba(0,0,0,0.7)',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    // Layer 3 — landmark fact popup: centred, dark background
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)',
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
      this.communities.push({
        name: c.name,
        parish: c.parish,
        note: c.note ?? '',
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }
  }

  update(carPos: THREE.Vector3): void {
    // Layer 1 — road callout
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2 — community signs
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.communityEl.innerHTML = `\u{1F3D8}️ <b>${c.name}</b><br><span style="font-weight:400;font-size:12px">${c.parish}</span>`;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 4500);
      narrate('community.enter', { community: c.name });
    }

    // Layer 3 — landmark popups
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
