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

// Recognition system: layer 1 road callouts + layer 2 community signs + layer 3 landmark popups.
export class Recognition {
  readonly signs: THREE.Group; // 3D community sign posts added to the scene
  private currentRoad: string | undefined;
  private readonly calloutEl: HTMLElement;
  private readonly communitySignEl: HTMLElement;
  private readonly popupEl: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private communityTimer: ReturnType<typeof setTimeout> | undefined;
  private popupTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly communities: CommunityEntry[] = [];
  private readonly landmarks: { name: string; fact: string; pos: THREE.Vector3; radius: number; shown: boolean }[] = [];

  constructor(private road: Road) {
    this.calloutEl = document.getElementById('callout')!;
    this.communitySignEl = document.getElementById('community-sign')!;

    this.popupEl = document.createElement('div');
    Object.assign(this.popupEl.style, {
      position: 'fixed', top: '96px', left: '50%', transform: 'translateX(-50%)',
      padding: '6px 16px', borderRadius: '6px', background: 'rgba(0,0,0,0.7)',
      color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600',
      fontSize: '15px', opacity: '0', transition: 'opacity 0.3s', userSelect: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.popupEl);

    // Build community entries and 3D sign posts
    this.signs = new THREE.Group();
    for (const c of communitiesData.communities) {
      const worldPos = road.project(c.lat, c.lon);
      this.communities.push({
        id: c.id, name: c.name, pos: worldPos, radius: c.radius, shown: false,
      });
      this.signs.add(makeSignPost(c.name, this.leftRoadsidePos(worldPos)));
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
      this.communitySignEl.textContent = c.name;
      this.communitySignEl.style.opacity = '1';
      clearTimeout(this.communityTimer);
      this.communityTimer = setTimeout(() => { this.communitySignEl.style.opacity = '0'; }, 4000);
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

  // Return a position 5.5 m to the left roadside of the nearest route point.
  // Left-hand traffic: left = +perp (same convention as road.ts ribbon).
  private leftRoadsidePos(worldPos: THREE.Vector3): THREE.Vector3 {
    const pts = this.road.points;
    const idx = this.road.nearestPointIndex(worldPos);
    const fwd = new THREE.Vector3();
    if (idx < pts.length - 1) fwd.subVectors(pts[idx + 1], pts[idx]);
    else fwd.subVectors(pts[idx], pts[idx - 1]);
    fwd.normalize();
    const perp = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return pts[idx].clone().addScaledVector(perp, 5.5);
  }
}

function makeSignPost(name: string, pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 4.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x303030 }),
  );
  pole.position.y = 2.0;

  // White border backing
  const border = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.2, 0.06),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  border.position.y = 4.4;

  // Jamaican highway green face
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(3.15, 0.95, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x007749 }),
  );
  face.position.set(0, 4.4, 0.04);

  g.add(pole, border, face);
  g.position.copy(pos);
  void name; // name shown in HUD not on 3D mesh in V1
  return g;
}
