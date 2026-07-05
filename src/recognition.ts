import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import signpostsData from '../data/signposts.json';
import type { Road } from './road';
import { narrate } from './narrator';

// ── Landmarks (recognition layer 3) ────────────────────────────────────────

// Recognition system: layer 1 road callouts + layer 3 landmark popups.
// Community signs (layer 2) — see data/communities.json, pending PR merge.
// Downtown signposts (layer 1.5) — off-route school callouts, see data/signposts.json.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private popupEl: HTMLElement;
  private signpostEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private signpostTimer: ReturnType<typeof setTimeout> | undefined;
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private signposts: { id: string; label: string; triggerRoad: string; narratorEvent: string; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Landmark popup — dark background, centred just below road callout
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    // Signpost panel — green road-sign style, upper-left, for off-route downtown schools
    this.signpostEl = document.createElement('div');
    Object.assign(this.signpostEl.style, {
      position: 'fixed', top: '64px', left: '12px',
      padding: '8px 14px', borderRadius: '4px',
      background: '#007749', color: '#fff',
      border: '2px solid #fff',
      fontFamily: 'system-ui, sans-serif', fontWeight: '700', fontSize: '13px',
      opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      maxWidth: '230px', lineHeight: '1.55',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.signpostEl);

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }

    for (const s of signpostsData.signposts) {
      this.signposts.push({ id: s.id, label: s.label, triggerRoad: s.trigger_road, narratorEvent: s.narrator_event, shown: false });
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

      // ── Signpost check (layer 1.5 — off-route downtown schools) ──────────
      for (const sp of this.signposts) {
        if (sp.shown || seg.name !== sp.triggerRoad) continue;
        sp.shown = true;
        this.signpostEl.innerHTML = `← Downtown Kingston<br><span style="font-weight:400;font-size:12px">${sp.label.replace(/\s*•\s*/g, '<br>')}</span>`;
        this.signpostEl.style.opacity = '1';
        clearTimeout(this.signpostTimer);
        this.signpostTimer = setTimeout(() => { this.signpostEl.style.opacity = '0'; }, 7000);
        narrate(sp.narratorEvent);
        break;
      }
    }

    // ── Landmark check (layer 3) ─────────────────────────────────────────
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
