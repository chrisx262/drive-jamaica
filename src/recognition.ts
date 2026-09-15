import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system: three layers of place identification (all data-driven).
// Layer 1 — road callouts: segment name changes
// Layer 2 — community signs: entering a community/district
// Layer 3 — landmark popups: prominent places with name + fact
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private signEl: HTMLDivElement;
  private signNameEl: HTMLSpanElement;
  private popupEl: HTMLElement;
  private hideCallout: ReturnType<typeof setTimeout> | undefined;
  private hideSign: ReturnType<typeof setTimeout> | undefined;
  private hidePopup: ReturnType<typeof setTimeout> | undefined;
  private communities: { name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Community sign (layer 2): styled like a Jamaican road sign
    this.signEl = document.createElement('div');
    this.signNameEl = document.createElement('span');
    const signLabel = document.createElement('small');
    signLabel.textContent = 'ENTERING';
    Object.assign(this.signEl.style, {
      position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 22px 10px', borderRadius: '4px',
      background: '#007749', border: '3px solid #fed100',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
      textAlign: 'center', opacity: '0', transition: 'opacity 0.4s',
      userSelect: 'none', lineHeight: '1.2',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(signLabel.style, {
      display: 'block', fontSize: '10px', letterSpacing: '2px', color: '#fed100',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.signNameEl.style, {
      display: 'block', fontSize: '20px', fontWeight: '800',
    } satisfies Partial<CSSStyleDeclaration>);
    this.signEl.append(signLabel, this.signNameEl);
    document.body.appendChild(this.signEl);

    // Landmark popup (layer 3) — positioned below community sign to avoid overlap
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '130px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    for (const c of communitiesData.communities) {
      this.communities.push({
        name: c.name,
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
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
      this.signNameEl.textContent = c.name;
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
