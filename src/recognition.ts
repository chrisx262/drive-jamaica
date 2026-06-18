import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import type { Road } from './road';
import { narrate } from './narrator';

interface LandmarkEntry {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius: number;
  fact: string;
  category?: string;
  narrator_event?: string;
  needs_owner_review?: boolean;
}

// Border colour per landmark category — thin left accent on the popup.
const CATEGORY_COLOURS: Record<string, string> = {
  school:   '#4a90d9',
  food:     '#e85d04',
  cultural: '#fed100',
  nature:   '#4e8c3a',
  road:     '#9aa0a6',
};

// Recognition system: layer 1 road callouts + layer 3 landmark popups.
// Community signs (layer 2) extend this module later.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: {
    name: string;
    fact: string;
    pos: THREE.Vector3;
    radius: number;
    shown: boolean;
    narratorEvent: string;
    category: string;
  }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px 6px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center', borderLeft: '4px solid #fff',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    for (const l of landmarksData.landmarks as LandmarkEntry[]) {
      this.landmarks.push({
        name: l.name,
        fact: l.fact,
        pos: road.project(l.lat, l.lon),
        radius: l.radius,
        shown: false,
        narratorEvent: l.narrator_event ?? 'landmark.enter',
        category: l.category ?? 'landmark',
      });
    }
  }

  update(carPos: THREE.Vector3): void {
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    for (const l of this.landmarks) {
      if (l.shown || l.pos.distanceTo(carPos) > l.radius) continue;
      l.shown = true;
      this.popupEl.style.borderLeft = `4px solid ${CATEGORY_COLOURS[l.category] ?? '#fff'}`;
      this.popupEl.innerHTML = `\u{1F4CD} <b>${l.name}</b><br>${l.fact}`;
      this.popupEl.style.opacity = '1';
      clearTimeout(this.popupTimer);
      this.popupTimer = setTimeout(() => { this.popupEl.style.opacity = '0'; }, 5000);
      narrate(l.narratorEvent, { landmark: l.name });
    }
  }
}
