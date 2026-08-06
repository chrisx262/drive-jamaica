import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import { ROAD_WIDTH } from './road';
import type { Road } from './road';
import { narrate } from './narrator';

// Recognition system — three layers of place identification (all data-driven):
//   Layer 1: road callout — road name shown when entering a new named segment.
//   Layer 2: community signs — green highway-style HUD sign + 3D roadside post.
//   Layer 3: landmark popups — name + one-line fact for prominent POIs.
export class Recognition {
  private currentRoad: string | undefined;

  private calloutEl: HTMLElement;
  private communityEl: HTMLElement;
  private popupEl: HTMLElement;

  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;

  private communities: { id: string; name: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];
  private landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  // 3D sign-post group — caller adds to scene.
  readonly signs: THREE.Group;

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;
    this.communityEl = document.getElementById('community-sign')!;

    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed',
      top: '96px',
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

    for (const c of communitiesData.communities) {
      this.communities.push({
        id: c.id,
        name: c.name,
        pos: road.project(c.lat, c.lon),
        radius: c.radius,
        shown: false,
      });
    }

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({
        name: l.name,
        fact: l.fact,
        pos: road.project(l.lat, l.lon),
        radius: l.radius,
        shown: false,
      });
    }

    this.signs = this.buildSignPosts();
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
      this.communityEl.textContent = c.name;
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

  // Green-and-white sign posts placed on the LEFT roadside at each community.
  // "Left" = driver's left in left-hand traffic = the negative perp of the road direction.
  private buildSignPosts(): THREE.Group {
    const group = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0x606060 });
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.8, 6);

    for (const c of this.communities) {
      const sign = new THREE.Group();

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 1.9;
      sign.add(post);

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 1.05, 0.08),
        new THREE.MeshLambertMaterial({ map: makeSignTexture(c.name) }),
      );
      board.position.y = 3.8 + 0.525;
      sign.add(board);

      // Green back face — visible from behind, no alpha needed.
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 1.05, 0.04),
        new THREE.MeshLambertMaterial({ color: 0x1a6b1a }),
      );
      back.position.set(0, 3.8 + 0.525, -0.06);
      sign.add(back);

      // Place on LEFT roadside (driver's left, left-hand traffic = neg perp).
      const nearestIdx = this.road.nearestPointIndex(c.pos);
      const pts = this.road.points;
      const dir = new THREE.Vector3();
      if (nearestIdx < pts.length - 1) {
        dir.subVectors(pts[nearestIdx + 1], pts[nearestIdx]).normalize();
      } else {
        dir.subVectors(pts[nearestIdx], pts[nearestIdx - 1]).normalize();
      }
      // Left perp in left-hand traffic: -dir.z, 0, dir.x
      const leftPerp = new THREE.Vector3(-dir.z, 0, dir.x);
      sign.position.copy(c.pos).addScaledVector(leftPerp, ROAD_WIDTH / 2 + 1.8);
      sign.rotation.y = Math.atan2(dir.x, dir.z);

      group.add(sign);
    }
    return group;
  }
}

function makeSignTexture(name: string): THREE.CanvasTexture {
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
