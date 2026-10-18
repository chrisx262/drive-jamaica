import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

const COMMUNITY_RADIUS = 300; // meters, compressed world — broad trigger so the sign fires on approach

// Recognition system: layer 1 road callouts, layer 2 community signs, layer 3 landmark popups.
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
  private communities: { id: string; name: string; pos: THREE.Vector3 }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2: community sign — styled like a Jamaican roadside community board
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '28px', right: '16px',
      padding: '5px 14px', borderRadius: '4px',
      background: '#007a33', // Jamaican green
      color: '#fed100', // Jamaican gold
      fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '14px', opacity: '0', transition: 'opacity 0.4s',
      userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.05em',
      border: '2px solid #fed100',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

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

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }

    for (const c of communitiesData.communities) {
      this.communities.push({ id: c.id, name: c.name, pos: road.project(c.lat, c.lon) });
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

    // Layer 2: community sign
    let nearest: { name: string } | undefined;
    let nearestDist = COMMUNITY_RADIUS;
    for (const c of this.communities) {
      const d = c.pos.distanceTo(carPos);
      if (d < nearestDist) { nearestDist = d; nearest = c; }
    }
    if (nearest && nearest.name !== this.currentCommunity) {
      this.currentCommunity = nearest.name;
      this.communityEl.textContent = nearest.name;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 5000);
      narrate('community.enter', { community: nearest.name });
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
