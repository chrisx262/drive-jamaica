import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Oncoming NPC traffic.  Drives in the opposite lane on the opposite route
// direction (left-hand traffic: player in left lane, NPCs in right lane coming
// the other way).
//
// Two sub-pools so Kingston looks like Kingston:
//   - Kingston cars (KINGSTON_POOL): circulate only through the urban segment
//     range, giving realistic gridlock density without blowing the NPC budget.
//   - Highway cars (HIGHWAY_POOL): spread across the rest of the route.
//
// Speed is in route-index-units / second, which is approximate but consistent
// enough for V1 (avg segment length ~42 m).
//   0.12 idx/s ≈ 21 km/h  (Kingston crawl)
//   0.30 idx/s ≈ 45 km/h  (open road)

const KINGSTON_POOL = 10;
const HIGHWAY_POOL = 8;

const KINGSTON_SPEED = 0.12; // idx/s
const HIGHWAY_SPEED = 0.30; // idx/s
const SPEED_JITTER = 0.05; // ± random variance

// Approximate route-point indices for the Kingston urban stretch.
// Windward Rd starts ~62, Spanish Town Rd ends ~129.
const KINGSTON_FROM = 62;
const KINGSTON_TO = 129;

// Distance (world units) within which a passing NPC counts as a near-miss.
const NEAR_MISS_DIST = 3.5;
const NEAR_MISS_COOLDOWN_MS = 7000; // narrator won't fire again for 7 s

// Jamaican road colors: old Corollas, ProBoxes, and the occasional flashy one.
const BODY_COLORS = [
  0x4b7bec, // blue
  0xea2027, // red
  0xf9ca24, // yellow (route taxi vibes)
  0xffffff, // white
  0x6ab04c, // faded green
  0xc9c9c9, // silver
  0x1289a7, // teal
  0xe84393, // hot pink
];

export class Traffic {
  readonly object: THREE.Group;
  private npcs: NpcCar[];
  private nearMissCooldown = 0;
  private kingstonAnnounced = false;

  // Scratch vectors to avoid per-frame allocation.
  private readonly _pos = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _perp = new THREE.Vector3();

  constructor(private road: Road) {
    this.object = new THREE.Group();
    const rng = mulberry32(8531);
    const len = road.points.length;

    this.npcs = [];

    // Kingston pool — distributed across urban stretch on init.
    for (let i = 0; i < KINGSTON_POOL; i++) {
      const idx = KINGSTON_FROM + rng() * (KINGSTON_TO - KINGSTON_FROM);
      this.npcs.push(new NpcCar(idx, true, rng));
    }

    // Highway pool — distributed from Kingston exit to end of route.
    for (let i = 0; i < HIGHWAY_POOL; i++) {
      const idx = KINGSTON_TO + rng() * (len - KINGSTON_TO - 5);
      this.npcs.push(new NpcCar(idx, false, rng));
    }

    for (const npc of this.npcs) this.object.add(npc.mesh);
  }

  update(dt: number, car: Car): void {
    const pts = this.road.points;
    const len = pts.length;
    const playerIdx = this.road.nearestPointIndex(car.position);

    if (this.nearMissCooldown > 0) this.nearMissCooldown -= dt * 1000;

    // Announce Kingston traffic once as the player enters the urban stretch.
    if (!this.kingstonAnnounced && playerIdx >= KINGSTON_FROM && playerIdx < KINGSTON_TO) {
      this.kingstonAnnounced = true;
      narrate('traffic.kingston');
    }

    for (const npc of this.npcs) {
      npc.idx -= npc.speed * dt;

      // Respawn logic differs by pool type.
      if (npc.isKingston) {
        // Keep Kingston cars circulating within the urban zone.
        if (npc.idx < KINGSTON_FROM) npc.idx = KINGSTON_TO - 1;
      } else {
        // Highway car: respawn ahead of the player when it drops behind.
        if (npc.idx < playerIdx || npc.idx < 1) {
          npc.idx = playerIdx + 300 + Math.random() * 350;
          if (npc.idx >= len - 2) npc.idx = len - 3;
        }
      }

      this.placeNpc(npc, pts);

      // Near-miss detection.
      if (this.nearMissCooldown <= 0 && car.position.distanceTo(npc.worldPos) < NEAR_MISS_DIST) {
        narrate('traffic.near_miss');
        this.nearMissCooldown = NEAR_MISS_COOLDOWN_MS;
      }
    }
  }

  private placeNpc(npc: NpcCar, pts: THREE.Vector3[]): void {
    const i = Math.max(0, Math.min(Math.floor(npc.idx), pts.length - 2));
    const t = npc.idx - i;

    // Interpolate world position and compute direction without allocation.
    this._pos.lerpVectors(pts[i], pts[i + 1], t);
    this._dir.subVectors(pts[i + 1], pts[i]).normalize();

    // +perp = opposite lane from the player.
    // (Player spawns at -perp*2; NPCs at +perp*2 — see car spawn in main.ts.)
    this._perp.set(-this._dir.z, 0, this._dir.x);
    this._pos.addScaledVector(this._perp, 2);
    this._pos.y = 0;

    npc.mesh.position.copy(this._pos);
    npc.worldPos.copy(this._pos);

    // Face toward the player (reverse of route forward direction).
    npc.mesh.rotation.y = Math.atan2(this._dir.x, this._dir.z);
  }
}

class NpcCar {
  readonly mesh: THREE.Group;
  readonly worldPos = new THREE.Vector3();
  idx: number;
  speed: number;
  readonly isKingston: boolean;

  constructor(startIdx: number, isKingston: boolean, rng: () => number) {
    this.idx = startIdx;
    this.isKingston = isKingston;
    const base = isKingston ? KINGSTON_SPEED : HIGHWAY_SPEED;
    this.speed = base + (rng() - 0.5) * 2 * SPEED_JITTER;

    const color = BODY_COLORS[Math.floor(rng() * BODY_COLORS.length)];
    const g = new THREE.Group();

    // Body (same rough scale as the player Corolla).
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.55, 4.0),
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
    body.position.y = 0.5;
    g.add(body);

    // Cabin roof.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.48, 2.1),
      new THREE.MeshLambertMaterial({ color: 0x2d3436, flatShading: true }),
    );
    cabin.position.set(0, 1.0, 0.1);
    g.add(cabin);

    // Four wheels, shared geometry per NPC (not shared across NPCs; acceptable
    // for 18 cars × 4 wheels = 72 meshes total).
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [wx, wz] of [[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.35], [0.85, 1.35]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx as number, 0.32, wz as number);
      g.add(w);
    }

    this.mesh = g;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
