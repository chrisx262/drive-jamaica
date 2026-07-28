import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system — three layers of place identification, all data-driven.
//   Layer 1: road callouts  — fires on road-name change (via #callout HUD element)
//   Layer 2: community signs — fires on community entry (right-side HUD panel)
//   Layer 3: landmark popups — fires once per landmark per session (centered popup)
export class Recognition {
  private currentRoad: string | undefined;
  private currentCommunity: string | undefined;
  private calloutEl: HTMLElement;
  private commSignEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private commHideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; note: string | undefined; pos: THREE.Vector3; radius: number }[] = [];

  constructor(private road: Road) {
    // Layer 1 — road callout (existing #callout element in index.html)
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2 — community sign (top-right, styled like a Jamaican welcome sign)
    this.commSignEl = document.createElement('div');
    Object.assign(this.commSignEl.style, {
      position: 'fixed', top: '12px', right: '12px',
      padding: '6px 16px', borderRadius: '6px',
      background: '#fff', color: '#1a5c2a', border: '2px solid #1a5c2a',
      fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: '16px',
      lineHeight: '1.25', textAlign: 'center',
      opacity: '0', transition: 'opacity 0.35s', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.commSignEl);

    // Layer 3 — landmark popup (centered below the callout)
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
      this.communities.push({ name: c.name, note: c.note, pos: road.project(c.lat, c.lon), radius: c.radius });
    }
  }

  update(carPos: THREE.Vector3): void {
    // Layer 1 — road name callout
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2 — community sign: show the closest community the car is inside
    let nearestComm: typeof this.communities[0] | undefined;
    let nearestDist = Infinity;
    for (const c of this.communities) {
      const d = c.pos.distanceTo(carPos);
      if (d <= c.radius && d < nearestDist) {
        nearestDist = d;
        nearestComm = c;
      }
    }
    const commName = nearestComm?.name;
    if (commName !== this.currentCommunity) {
      this.currentCommunity = commName;
      if (nearestComm) {
        this.commSignEl.innerHTML =
          `<span style="font-size:11px;letter-spacing:0.06em;opacity:0.7">WELCOME TO</span><br>${nearestComm.name}`;
        this.commSignEl.style.opacity = '1';
        clearTimeout(this.commHideTimer);
        this.commHideTimer = setTimeout(() => { this.commSignEl.style.opacity = '0'; }, 5000);
        narrate('community.enter', { community: nearestComm.name });
      }
    }

    // Layer 3 — landmark popup (shown once per landmark per session)
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
