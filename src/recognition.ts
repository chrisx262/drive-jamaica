import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import { ROAD_WIDTH } from './road';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system — three layers per GAME_SPEC:
//   Layer 1: road callout when entering a new named segment
//   Layer 2: community sign (HUD + 3D roadside post) when passing into a district
//   Layer 3: landmark popup (name + one-line fact) when passing a POI
export class Recognition {
  private currentRoad: string | undefined;

  // HUD elements
  private calloutEl: HTMLElement;
  private communityEl: HTMLElement;
  private popupEl: HTMLElement;

  // Timers
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;

  // Data
  private communities: { name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  // 3D community sign posts — add to scene from main.ts
  readonly signs: THREE.Group;

  constructor(private road: Road) {
    // Layer 1 — road callout (id="callout" already in index.html)
    this.calloutEl = document.getElementById('callout')!;

    // Layer 2 — community sign HUD (styled like a Jamaican road sign)
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed',
      bottom: '108px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '7px 22px',
      borderRadius: '4px',
      background: '#1a6b1a',
      border: '3px solid #ffffff',
      color: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '17px',
      letterSpacing: '0.04em',
      opacity: '0',
      transition: 'opacity 0.35s',
      userSelect: 'none',
      textAlign: 'center',
      boxShadow: '0 2px 10px rgba(0,0,0,0.55)',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    // Layer 3 — landmark popup
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed',
      top: '64px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 16px',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '600',
      fontSize: '15px',
      opacity: '0',
      transition: 'opacity 0.3s',
      userSelect: 'none',
      textAlign: 'center',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    // Load community data
    for (const c of communitiesData.communities) {
      this.communities.push({
        name: c.name,
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }

    // Load landmark data
    for (const l of landmarksData.landmarks) {
      this.landmarks.push({
        name: l.name,
        fact: l.fact,
        pos: road.project(l.lat, l.lon),
        radius: l.radius,
        shown: false,
      });
    }

    // Build 3D community sign posts placed along the roadside
    this.signs = this.buildSigns();
  }

  update(carPos: THREE.Vector3): void {
    // Layer 1 — road callout
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2 — community signs (one trigger per community per session)
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.communityEl.textContent = `\u{1F4CD} ${c.name}`;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 4500);
      narrate('community.enter', { community: c.name });
    }

    // Layer 3 — landmark popups
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

  // Build 3D sign posts for every community, placed on the left roadside.
  private buildSigns(): THREE.Group {
    const group = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0x606060 });
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.8, 6);

    for (const c of this.communities) {
      const sign = new THREE.Group();

      // Metal post
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 1.9;
      sign.add(post);

      // Green board with white text (canvas texture)
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 1.05, 0.08),
        new THREE.MeshLambertMaterial({ map: this.makeSignTexture(c.name) }),
      );
      board.position.y = 3.8 + 0.525;
      sign.add(board);

      // Plain green back face
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 1.05, 0.04),
        new THREE.MeshLambertMaterial({ color: 0x1a6b1a }),
      );
      back.position.set(0, 3.8 + 0.525, -0.06);
      sign.add(back);

      // Place roadside: offset to the LEFT of the direction of travel
      const nearestIdx = this.road.nearestPointIndex(c.pos);
      const pts = this.road.points;
      const dir = new THREE.Vector3();
      if (nearestIdx < pts.length - 1) {
        dir.subVectors(pts[nearestIdx + 1], pts[nearestIdx]).normalize();
      } else {
        dir.subVectors(pts[nearestIdx], pts[nearestIdx - 1]).normalize();
      }
      const leftPerp = new THREE.Vector3(-dir.z, 0, dir.x);
      sign.position.copy(c.pos).addScaledVector(leftPerp, ROAD_WIDTH / 2 + 1.8);
      sign.rotation.y = Math.atan2(dir.x, dir.z);

      group.add(sign);
    }
    return group;
  }

  private makeSignTexture(name: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1a6b1a';
    ctx.fillRect(0, 0, 256, 96);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, 246, 86);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = name.length > 14 ? 'bold 16px sans-serif' : 'bold 20px sans-serif';
    ctx.fillText(name, 128, 48);

    return new THREE.CanvasTexture(canvas);
  }
}
