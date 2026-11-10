import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system: all three layers of place identification (GAME_SPEC).
//   Layer 1 — road callouts: HUD banner when the road name changes.
//   Layer 2 — community signs: green entry sign when entering a district.
//   Layer 3 — landmark popups: name + one-line fact for notable places.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private popupEl: HTMLElement;
  private communityEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private communities: { name: string; triggerSegment: string; minPointIndex: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    // Layer 1: road-name callout (uses existing #callout HUD element)
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

    // Layer 2: community sign — styled as a green road sign panel
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '50%', right: '28px', transform: 'translateY(-50%)',
      padding: '10px 16px', borderRadius: '3px', background: '#1a6b1e',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '13px', opacity: '0', transition: 'opacity 0.4s', userSelect: 'none',
      textAlign: 'center', border: '3px solid #fff', letterSpacing: '0.06em',
      lineHeight: '1.4',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    // Initialise landmarks (layer 3)
    for (const l of landmarksData.landmarks) {
      this.landmarks.push({
        name: l.name, fact: l.fact,
        pos: road.project(l.lat, l.lon),
        radius: l.radius,
        shown: false,
      });
    }

    // Initialise communities (layer 2)
    for (const c of communitiesData.communities) {
      this.communities.push({
        name: c.name,
        triggerSegment: c.trigger_segment,
        minPointIndex: c.min_point_index,
        shown: false,
      });
    }
  }

  update(carPos: THREE.Vector3): void {
    const nearestIdx = this.road.nearestPointIndex(carPos);
    const seg = this.road.segmentAt(nearestIdx);

    // Layer 1: road callout
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2: community sign
    if (seg) {
      for (const c of this.communities) {
        if (!c.shown && seg.name === c.triggerSegment && nearestIdx >= c.minPointIndex) {
          c.shown = true;
          this.communityEl.textContent = `Welcome to\n${c.name.toUpperCase()}`;
          this.communityEl.style.opacity = '1';
          clearTimeout(this.communityTimer);
          this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 5000);
          narrate('community.enter', { community: c.name });
          break; // show one community sign at a time
        }
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
