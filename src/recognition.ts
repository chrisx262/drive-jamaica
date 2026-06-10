import type * as THREE from 'three';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system, layer 1: road callouts. Shows the road name whenever
// the player moves onto a differently-named segment. Community signs and
// landmark popups (layers 2 and 3) extend this module later.
export class Recognition {
  private currentRoad: string | undefined;
  private calloutEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;
  }

  update(carPos: THREE.Vector3): void {
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (!seg || seg.name === this.currentRoad) return;
    this.currentRoad = seg.name;
    this.calloutEl.textContent = seg.name;
    this.calloutEl.style.opacity = '1';
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
    narrate('road.enter', { road: seg.name });
  }
}
