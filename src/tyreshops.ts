import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

export const REPAIR_RADIUS = 8;   // metres — drive this close to get served
const HINT_RADIUS = 25;           // metres — HUD hint appears
const REPAIR_SPEED = 7;           // m/s (~25 km/h) — must slow right down

// One shop per entry. Each number is a point index into road.points; the shop
// is placed just off the LEFT edge of the road (player's lane side).
// Locations are chosen near town centres: Kingston east, Half Way Tree,
// Spanish Town, Linstead (×2), Moneague, highlands, Fern Gully.
const SHOP_POINT_INDICES = [82, 118, 232, 356, 373, 430, 540, 790] as const;

const ROAD_HALF_WIDTH = 4; // ROAD_WIDTH / 2 from road.ts
const SIDE_OFFSET = 9;     // metres from road centre → well clear of the tarmac

// Shared canvas texture — "TYRE SHOP" sign on black background, Jamaican yellow text.
let sharedSignTex: THREE.CanvasTexture | undefined;
function getSignTexture(): THREE.CanvasTexture {
  if (!sharedSignTex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#f5d02c';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TYRE SHOP', 128, 32);
    sharedSignTex = new THREE.CanvasTexture(canvas);
  }
  return sharedSignTex;
}

function buildShop(pos: THREE.Vector3, faceAngle: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = faceAngle;

  // Yellow stall walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 2.5, 1.8),
    new THREE.MeshLambertMaterial({ color: 0xf5d02c }),
  );
  walls.position.y = 1.25;
  g.add(walls);

  // Zinc-sheet roof (slightly overhanging, silver-grey)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.1, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x9ab0b0 }),
  );
  roof.position.y = 2.55;
  g.add(roof);

  // Sign board above stall (canvas texture)
  const signMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.55, 0.08),
    new THREE.MeshLambertMaterial({ map: getSignTexture() }),
  );
  signMesh.position.y = 3.1;
  g.add(signMesh);

  // Stack of 3 tyres leaning against the front
  const tyreGeo = new THREE.TorusGeometry(0.38, 0.13, 5, 10);
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (let i = 0; i < 3; i++) {
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.rotation.x = Math.PI / 2; // lay flat
    tyre.position.set(0.8, 0.13 + i * 0.28, 1.1);
    g.add(tyre);
  }

  // Second small tyre stack
  for (let i = 0; i < 2; i++) {
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.rotation.x = Math.PI / 2;
    tyre.position.set(-0.8, 0.13 + i * 0.28, 1.1);
    g.add(tyre);
  }

  return g;
}

export class TyreShops {
  readonly object: THREE.Group;
  private positions: THREE.Vector3[] = [];
  private hintEl: HTMLElement;
  private repairedThisBurst = false; // debounce: one repair per burst event

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    for (const idx of SHOP_POINT_INDICES) {
      if (idx >= road.points.length - 1) continue;
      const a = road.points[idx];
      const b = road.points[Math.min(idx + 1, road.points.length - 1)];
      const dir = b.clone().sub(a).normalize();
      // Left side of road in left-hand traffic (perpendicular, toward player lane side)
      const left = new THREE.Vector3(-dir.z, 0, dir.x);
      const shopPos = a.clone().addScaledVector(left, ROAD_HALF_WIDTH + SIDE_OFFSET);
      shopPos.y = 0;
      this.positions.push(shopPos.clone());

      // Shop faces inward (toward the road, i.e. the -left direction)
      const faceAngle = Math.atan2(-left.x, -left.z);
      this.object.add(buildShop(shopPos, faceAngle));
    }

    this.hintEl = document.createElement('div');
    Object.assign(this.hintEl.style, {
      position: 'fixed',
      bottom: '52px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '4px 14px',
      borderRadius: '4px',
      background: 'rgba(245,208,44,0.92)',
      color: '#111',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      fontSize: '13px',
      display: 'none',
      userSelect: 'none',
      letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);
    this.hintEl.textContent = '🔧 TYRE SHOP — slow down to get patched';
    document.body.appendChild(this.hintEl);
  }

  update(car: Car): void {
    if (!car.tyreBurst) {
      // New burst will start fresh
      this.repairedThisBurst = false;
      this.hintEl.style.display = 'none';
      return;
    }

    let nearAny = false;
    for (const pos of this.positions) {
      const dist = pos.distanceTo(car.position);
      if (dist < HINT_RADIUS) nearAny = true;
      if (dist < REPAIR_RADIUS && Math.abs(car.speed) < REPAIR_SPEED && !this.repairedThisBurst) {
        this.repairedThisBurst = true;
        car.repairTyre();
        narrate('tyre.repaired');
        this.hintEl.style.display = 'none';
        return;
      }
    }

    this.hintEl.style.display = nearAny ? 'block' : 'none';
  }
}
