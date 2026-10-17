import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Faith's Pen — famous roadside cookshop stop on the Moneague–Ochi run.
// GAME_SPEC: optional pull-over; eating repairs tyre damage + feel-good bonus;
// skippable but tempting.

const FAITH_LAT = 18.3010;
const FAITH_LON = -77.1220;

const APPROACH_RADIUS = 120;  // meters — narrator teases the stop
const PULL_OVER_SPEED = 4;    // km/h — slow enough to "pull over"

export const FAITHSPEN_BONUS_PTS = 100; // score bonus for stopping

export class FaithsPen {
  readonly object: THREE.Group;
  private zonePos: THREE.Vector3;
  private hudEl: HTMLElement;

  // State — progression through the stop
  private approachNarrated = false;
  private stopped = false;   // has the player eaten here this session?
  private inZone = false;
  bonusPoints = 0;           // queryable by Scoring.snapshot()

  constructor(road: Road) {
    this.zonePos = road.project(FAITH_LAT, FAITH_LON);
    this.object = new THREE.Group();

    // Place cookshop stalls on the LEFT verge (left-hand traffic).
    const ptIdx = road.nearestPointIndex(this.zonePos);
    const ptA = road.points[Math.max(0, ptIdx - 1)];
    const ptB = road.points[Math.min(road.points.length - 1, ptIdx + 1)];
    const roadDir = ptB.clone().sub(ptA).normalize();
    // Perpendicular pointing LEFT of the direction of travel
    const leftPerp = new THREE.Vector3(-roadDir.z, 0, roadDir.x);
    const stallOrigin = this.zonePos.clone().addScaledVector(leftPerp, 11);

    // Three simple stall boxes as placeholders (replace with GLB when ready).
    const stallColors = [0xd4380d, 0xf5a623, 0x52c41a]; // red, orange, green roofs — Jamaican colours
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 4.2;
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.4, 3.8),
        new THREE.MeshLambertMaterial({ color: 0xe0d5b2, flatShading: true }),
      );
      wallMesh.position.set(
        stallOrigin.x + leftPerp.x * offset,
        1.2,
        stallOrigin.z + leftPerp.z * offset,
      );
      const roofMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.22, 4.2),
        new THREE.MeshLambertMaterial({ color: stallColors[i], flatShading: true }),
      );
      roofMesh.position.set(
        stallOrigin.x + leftPerp.x * offset,
        2.51,
        stallOrigin.z + leftPerp.z * offset,
      );
      this.object.add(wallMesh, roofMesh);
    }

    // HUD prompt — bottom-centre, visible when inside the approach zone.
    this.hudEl = document.createElement('div');
    Object.assign(this.hudEl.style, {
      position: 'fixed', bottom: '56px', left: '50%', transform: 'translateX(-50%)',
      padding: '8px 28px', borderRadius: '8px', background: 'rgba(0,0,0,0.80)',
      color: '#ffd700', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '16px', opacity: '0', transition: 'opacity 0.45s',
      userSelect: 'none', textAlign: 'center', pointerEvents: 'none',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.hudEl);
  }

  update(car: Car): void {
    if (this.stopped) return;

    const dist = this.zonePos.distanceTo(car.position);
    const wasInZone = this.inZone;
    this.inZone = dist < APPROACH_RADIUS;

    if (this.inZone) {
      if (!this.approachNarrated) {
        this.approachNarrated = true;
        narrate('faithspen.approach');
      }

      if (car.speedKmh < PULL_OVER_SPEED) {
        // Player pulled over — trigger the stop.
        this.stopped = true;
        this.hudEl.style.opacity = '0';
        car.repairTyre();
        this.bonusPoints = FAITHSPEN_BONUS_PTS;
        narrate('faithspen.eat');
      } else {
        this.hudEl.textContent = '🍗 Faith\'s Pen ahead — ease up fi jerk chicken!';
        this.hudEl.style.opacity = '1';
      }
    } else if (wasInZone && !this.inZone && !this.stopped) {
      // Drove through without stopping.
      this.hudEl.style.opacity = '0';
      narrate('faithspen.skip');
    }
  }
}
