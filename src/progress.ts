import * as THREE from 'three';
import type { Road } from './road';
import { narrate } from './narrator';

// Key waypoints shown as tick marks on the bar.
// Fractions derived from segment 'from' indices against total route points (839).
interface Milestone {
  readonly label: string;
  readonly fraction: number;
}

const MILESTONES: Milestone[] = [
  { label: 'Kingston',    fraction: 108 / 839 },  // Hagley Park Road
  { label: 'Bog Walk',    fraction: 260 / 839 },  // Bog Walk Gorge entry
  { label: 'Linstead',   fraction: 342 / 839 },  // Linstead Bypass
  { label: "Faith's Pen", fraction: 630 / 839 }, // Moneague–Ocho Rios Road start
  { label: 'Fern Gully', fraction: 786 / 839 },  // Milford Road (canopy descent)
];

// Point index threshold past which we fire the route.finish narrator line (once).
// Corresponds to arriving on Northern Coastal Highway approaching Ochi.
const FINISH_THRESHOLD = 807;

export class RouteProgress {
  private readonly totalPoints: number;
  private furthestIndex = 0;
  private finishFired = false;
  private readonly fillEl: HTMLDivElement;
  private readonly dotEl: HTMLDivElement;

  constructor(private readonly road: Road) {
    this.totalPoints = road.points.length - 1;
    const { wrap, fill, dot } = this.buildHUD();
    document.body.appendChild(wrap);
    this.fillEl = fill;
    this.dotEl = dot;
  }

  private buildHUD(): { wrap: HTMLDivElement; fill: HTMLDivElement; dot: HTMLDivElement } {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'fixed',
      bottom: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(480px, 70vw)',
      userSelect: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // End-point labels
    const labels = document.createElement('div');
    Object.assign(labels.style, {
      display: 'flex',
      justifyContent: 'space-between',
      color: 'rgba(255,255,255,0.88)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
      fontWeight: '700',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      marginBottom: '4px',
    } satisfies Partial<CSSStyleDeclaration>);
    const startLbl = document.createElement('span');
    startLbl.textContent = '✈ Airport';
    const endLbl = document.createElement('span');
    endLbl.textContent = 'Ochi';
    labels.append(startLbl, endLbl);

    // Track (the bar itself)
    const track = document.createElement('div');
    Object.assign(track.style, {
      position: 'relative',
      height: '4px',
      borderRadius: '2px',
      background: 'rgba(255,255,255,0.22)',
    } satisfies Partial<CSSStyleDeclaration>);

    // Completed-distance fill (Jamaica green)
    const fill = document.createElement('div');
    Object.assign(fill.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      bottom: '0',
      width: '0%',
      borderRadius: '2px',
      background: '#007749',
      transition: 'width 0.25s linear',
    } satisfies Partial<CSSStyleDeclaration>);

    // Player position dot (Jamaica gold)
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'absolute',
      top: '50%',
      left: '0%',
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      background: '#fed100',
      border: '1.5px solid rgba(255,255,255,0.9)',
      transform: 'translate(-50%, -50%)',
      transition: 'left 0.25s linear',
    } satisfies Partial<CSSStyleDeclaration>);

    // Milestone tick marks: thin vertical lines that subtly show waypoints.
    // Text labels omitted to avoid crowding — Airport/Ochi ends are enough orientation.
    for (const m of MILESTONES) {
      const tick = document.createElement('div');
      tick.title = m.label;
      Object.assign(tick.style, {
        position: 'absolute',
        top: '-2px',
        bottom: '-2px',
        left: `${(m.fraction * 100).toFixed(1)}%`,
        width: '1px',
        background: 'rgba(255,255,255,0.4)',
        transform: 'translateX(-50%)',
      } satisfies Partial<CSSStyleDeclaration>);
      track.appendChild(tick);
    }

    track.append(fill, dot);
    wrap.append(labels, track);
    return { wrap, fill, dot };
  }

  update(carPos: THREE.Vector3): void {
    const idx = this.road.nearestPointIndex(carPos);
    // Progress bar never rolls back — only advance forward along the route.
    if (idx > this.furthestIndex) {
      this.furthestIndex = idx;

      if (!this.finishFired && this.furthestIndex >= FINISH_THRESHOLD) {
        this.finishFired = true;
        narrate('route.arrive_ochi');
      }
    }

    const pct = `${Math.min(100, (this.furthestIndex / this.totalPoints) * 100).toFixed(2)}%`;
    this.fillEl.style.width = pct;
    this.dotEl.style.left = pct;
  }
}
