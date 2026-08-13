import * as THREE from 'three';
import landmarksData from '../data/landmarks.json';
import communitiesData from '../data/communities.json';
import type { Road } from './road';
import { narrate } from './narrator';

interface CommunityEntry {
  id: string;
  name: string;
  pos: THREE.Vector3;
  radius: number;
  shown: boolean;
}

// Recognition system — all three layers of place identification:
//   Layer 1 — road name callouts (street-sign HUD, existing #callout element)
//   Layer 2 — community signs (Jamaican green/gold HUD + 3D sign post)
//   Layer 3 — landmark popups (name + one-line fact HUD)
export class Recognition {
  readonly signs: THREE.Group; // community sign posts — added to scene in main.ts
  private currentRoad: string | undefined;
  private readonly calloutEl: HTMLElement;
  private readonly communityEl: HTMLElement;
  private readonly popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly communities: CommunityEntry[] = [];
  private readonly landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;

    // Community sign HUD — Jamaican green background, gold text
    this.communityEl = document.createElement('div');
    Object.assign(this.communityEl.style, {
      position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
      padding: '5px 14px', borderRadius: '6px',
      background: '#007749', color: '#fed100', border: '2px solid #fed100',
      fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: '16px',
      opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.communityEl);

    // Landmark popup — sits below the community sign HUD
    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '108px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    // Build community entries and 3D sign posts along the left roadside
    this.signs = new THREE.Group();
    const pts = road.points;
    for (const c of communitiesData.communities) {
      const worldPos = road.project(c.lat, c.lon);
      this.communities.push({ id: c.id, name: c.name, pos: worldPos, radius: c.radius, shown: false });

      // Compute road direction at nearest route point so the sign faces traffic
      const idx = road.nearestPointIndex(worldPos);
      const fwd = new THREE.Vector3();
      if (idx < pts.length - 1) fwd.subVectors(pts[idx + 1], pts[idx]);
      else fwd.subVectors(pts[idx], pts[idx - 1]);
      fwd.normalize();

      // Place sign on the left roadside (+perp in left-hand traffic)
      const perp = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const sidePos = pts[idx].clone().addScaledVector(perp, 5.5);

      this.signs.add(makeSignPost(c.name, sidePos, fwd));
    }

    for (const l of landmarksData.landmarks) {
      this.landmarks.push({ name: l.name, fact: l.fact, pos: road.project(l.lat, l.lon), radius: l.radius, shown: false });
    }
  }

  update(carPos: THREE.Vector3): void {
    // Layer 1: road name callout
    const seg = this.road.segmentAt(this.road.nearestPointIndex(carPos));
    if (seg && seg.name !== this.currentRoad) {
      this.currentRoad = seg.name;
      this.calloutEl.textContent = seg.name;
      this.calloutEl.style.opacity = '1';
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { this.calloutEl.style.opacity = '0'; }, 4000);
      narrate('road.enter', { road: seg.name });
    }

    // Layer 2: community signs
    for (const c of this.communities) {
      if (c.shown || c.pos.distanceTo(carPos) > c.radius) continue;
      c.shown = true;
      this.communityEl.textContent = c.name;
      this.communityEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communityEl.style.opacity = '0'; }, 4000);
      narrate('community.enter', { community: c.name });
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

// 3D sign post with Jamaican road-sign colours and canvas-texture text label.
// fwd is the road forward direction; the sign face rotates to face passing traffic.
function makeSignPost(name: string, pos: THREE.Vector3, fwd: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();

  // Grey pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 4.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x505050 }),
  );
  pole.position.y = 2.0;

  // White border backing
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.9, 0.08),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  backing.position.y = 4.1;

  // Canvas texture: dark green face with gold text
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#005a33';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#fed100';
  const fontSize = name.length > 14 ? 38 : name.length > 10 ? 44 : 52;
  ctx.font = `bold ${fontSize}px system-ui, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.72, 0.09),
    new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  face.position.y = 4.1;
  face.position.z = 0.01;

  g.add(pole, backing, face);
  g.position.copy(pos);
  g.position.y = 0;

  // Orient the sign to face oncoming traffic (toward -fwd)
  g.rotation.y = Math.atan2(fwd.x, fwd.z);

  return g;
}
