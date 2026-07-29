import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const APPROACH_RADIUS = 35; // narrator hint fires when tyre is burst & car is this close
const REPAIR_RADIUS = 9;    // repair starts when car pulls up this close
const REPAIR_TIME = 3500;   // ms to fix the tyre (faster than the auto-repair fallback)

// Towns with roadside tyre shops along the post-Palisadoes route.
// Owner rule: no potholes on the Palisadoes strip, so no shops until Harbour View.
const SHOP_DEFS: Array<{ segment: string; frac: number }> = [
  { segment: 'Sir Florizel Glaspole Boulevard', frac: 0.5 }, // Harbour View
  { segment: 'Mountain View Avenue', frac: 0.4 },             // Kingston East
  { segment: 'Spanish Town Bypass', frac: 0.5 },              // Spanish Town
  { segment: 'Bog Walk Roundabout', frac: 0.4 },              // Bog Walk village
  { segment: "King's Street", frac: 0.4 },                    // Linstead
  { segment: 'Moneague - Ocho Rios Road', frac: 0.06 },      // Moneague
  { segment: 'Northern Coastal Highway', frac: 0.3 },         // Ocho Rios
];

export class TyreShops {
  readonly object: THREE.Group;
  private readonly positions: THREE.Vector3[] = [];
  private repairing = false;
  private hinted = false;
  private repairTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    for (const def of SHOP_DEFS) {
      const seg = road.segments.find((s) => s.name === def.segment);
      if (!seg) continue; // test track or segment not yet in route data — skip silently

      const idx = Math.min(
        Math.floor(seg.from + def.frac * (seg.to - seg.from)),
        road.points.length - 2,
      );
      const p = road.points[idx];
      const next = road.points[idx + 1];
      const dir = next.clone().sub(p).normalize();
      // Left side of road — Jamaica drives on the LEFT; shops line the left kerb
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const shopPos = p.clone().addScaledVector(perp, 12);
      shopPos.y = 0;

      this.positions.push(shopPos.clone());
      this.object.add(this.buildShop(shopPos));
    }
  }

  private buildShop(pos: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    // Cinder-block shed in classic Jamaican coral/terracotta colour
    const shed = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 2.4, 3.0),
      new THREE.MeshLambertMaterial({ color: 0xcc5533, flatShading: true }),
    );
    shed.position.y = 1.2;

    // Corrugated zinc roof — slightly overhanging
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.15, 3.4),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa, flatShading: true }),
    );
    roof.position.y = 2.55;

    // Stack of four tyres leaning against the front
    const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111, flatShading: true });
    const holeMat = new THREE.MeshLambertMaterial({ color: 0x555555, flatShading: true });
    const tyreGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.24, 10);
    const holeGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.28, 10);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(tyreGeo, tyreMat);
      t.position.set(-1.4, 0.12 + i * 0.24, 1.8);
      g.add(t);
      const h = new THREE.Mesh(holeGeo, holeMat);
      h.position.set(-1.4, 0.12 + i * 0.24, 1.8);
      g.add(h);
    }

    // Sign post (wood-brown) + hand-painted yellow board
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 3.2, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x5a3e1b, flatShading: true }),
    );
    post.position.set(2.4, 1.6, 0);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.7, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xfed100, flatShading: true }),
    );
    sign.position.set(2.4, 3.35, 0);

    g.add(shed, roof, post, sign);
    return g;
  }

  update(car: Car): void {
    if (!car.tyreBurst) {
      // Tyre is healthy — reset per-burst hint flag so the next burst can re-trigger it
      this.hinted = false;
      if (this.repairing) {
        // Auto-repair (pothole fallback) beat us to it — cancel our pending timer cleanly
        clearTimeout(this.repairTimer);
        this.repairing = false;
      }
      return;
    }
    if (this.repairing) return;

    for (const pos of this.positions) {
      const d = pos.distanceTo(car.position);
      // Approaching hint — fires once per burst to guide the player
      if (!this.hinted && d < APPROACH_RADIUS) {
        this.hinted = true;
        narrate('tyreshop.nearby');
      }
      // Pull up close enough → repair begins
      if (d < REPAIR_RADIUS) {
        this.repairing = true;
        narrate('tyreshop.repairing');
        this.repairTimer = setTimeout(() => {
          car.repairTyre();
          narrate('tyreshop.repaired');
          this.repairing = false;
        }, REPAIR_TIME);
        break;
      }
    }
  }
}
