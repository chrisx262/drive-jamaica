import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';


// Recognition system — three layers:
//   Layer 1: road callouts (fires when the player enters a new named road segment)
//   Layer 2: community signs (fires once per session on entering each community)
//   Layer 3: landmark popups (fires on proximity to lat/lon landmarks)
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private communitySignEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private readonly communities = communitiesData.communities;
  private readonly shownCommunities = new Set<string>();

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2: community sign — top-right, green Jamaican road-sign style.
    this.communitySignEl = document.createElement('div');
    Object.assign(this.communitySignEl.style, {
      position: 'fixed', top: '12px', right: '12px',
      padding: '6px 14px', borderRadius: '4px',
      background: '#007749', color: '#fff', border: '2px solid #fff',
      fontFamily: 'system-ui, sans-serif', fontWeight: '800',
      fontSize: '13px', lineHeight: '1.35', opacity: '0',
      transition: 'opacity 0.4s', userSelect: 'none', textAlign: 'center',
      minWidth: '110px',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communitySignEl);

    // Layer 3: landmark popup — centred below the road callout.
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
  }

  update(carPos: THREE.Vector3): void {
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;

      // Layer 1: road name callout.
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });

      // Layer 2: community sign — fires once per session for each community.
      const community = this.communities.find(
        c => c.trigger_segment === seg.name && !this.shownCommunities.has(c.id),
      );
      if (community) {
        this.shownCommunities.add(community.id);
        this.communitySignEl.innerHTML = `ENTERING<br><b>${community.name}</b>`;
        this.communitySignEl.style.opacity = '1';
        clearTimeout(this.communityTimer);
        this.communityTimer = setTimeout(() => { this.communitySignEl.style.opacity = '0'; }, 5500);
        narrate('community.enter', { community: community.name });
      }
    }

    // Layer 3: landmark popups.
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
