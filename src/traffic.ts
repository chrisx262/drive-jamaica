import * as THREE from 'three';
import type { RoadLike } from './road';

// Kingston city traffic — slow-moving NPC convoy in the left lane.
// Filling the frustration meter (see monstertruck.ts) depends on this module.

const ZONE_FROM = 62;      // Windward Road (first busy city road)
const ZONE_TO   = 200;     // through Hagley Park Rd / half of city run
const NPC_COUNT = 22;
const NPC_SPEED = 4.8;     // m/s ≈ 17 km/h — congested Jamaican city traffic
const CRUSH_RADIUS = 6.5;  // monster truck crushes NPCs within this distance (m)

interface Npc {
  mesh: THREE.Group;
  routeIdx: number;
  t: number;       // 0..1 progress between routeIdx and routeIdx+1
  active: boolean;
}

export class Traffic {
  readonly object: THREE.Group;
  private npcs: Npc[] = [];

  constructor(private road: RoadLike) {
    this.object = new THREE.Group();
    if (road.points.length <= ZONE_TO) return; // test track guard

    const rng = mulberry32(9919);
    for (let i = 0; i < NPC_COUNT; i++) {
      const startIdx = ZONE_FROM + Math.floor(rng() * (ZONE_TO - ZONE_FROM));
      const npc: Npc = {
        mesh: makeNpcCar(rng),
        routeIdx: startIdx,
        t: rng(),
        active: true,
      };
      this.npcs.push(npc);
      this.object.add(npc.mesh);
      this.placeNpc(npc);
    }
  }

  update(dt: number, carPos: THREE.Vector3, isMonsterTruck: boolean): void {
    const pts = this.road.points;
    for (const npc of this.npcs) {
      if (!npc.active) continue;

      if (isMonsterTruck && npc.mesh.position.distanceTo(carPos) < CRUSH_RADIUS) {
        this.crushNpc(npc);
        continue;
      }

      const nextIdx = Math.min(npc.routeIdx + 1, pts.length - 1);
      const segLen = pts[npc.routeIdx].distanceTo(pts[nextIdx]);
      npc.t += (NPC_SPEED * dt) / Math.max(segLen, 0.5);

      while (npc.t >= 1 && npc.routeIdx < ZONE_TO - 1) {
        npc.t -= 1;
        npc.routeIdx++;
      }
      if (npc.routeIdx >= ZONE_TO - 1) {
        npc.routeIdx = ZONE_FROM;
        npc.t = 0;
      }
      if (npc.routeIdx < pts.length - 1) this.placeNpc(npc);
    }
  }

  // Returns frustration delta per second (+ve = filling, -ve = draining).
  // Fills when the player is slow AND near active traffic in the city zone.
  getFrustrationDelta(carPos: THREE.Vector3, carSpeed: number): number {
    const trafficNearby = this.npcs.some(
      (n) => n.active && n.mesh.position.distanceTo(carPos) < 38,
    );
    if (trafficNearby && Math.abs(carSpeed) < 7) return 0.13;
    return -0.06;
  }

  private placeNpc(npc: Npc): void {
    const pts = this.road.points;
    const i = npc.routeIdx;
    if (i >= pts.length - 1) return;
    const a = pts[i];
    const b = pts[i + 1];
    const pos = a.clone().lerp(b, npc.t);
    const dir = b.clone().sub(a).normalize();
    // Left lane: Jamaica drives on the LEFT — same offset formula as car spawner
    const left = new THREE.Vector3(dir.z, 0, -dir.x);
    pos.addScaledVector(left, 2);
    pos.y = 0;
    npc.mesh.position.copy(pos);
    npc.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
  }

  private crushNpc(npc: Npc): void {
    npc.active = false;
    // Cartoon flatten: squash and stretch downward, then fade out
    npc.mesh.scale.set(1.5, 0.12, 1.5);
    npc.mesh.position.y = 0.04;
    setTimeout(() => { npc.mesh.visible = false; }, 1400);
  }
}

// Varied NPC car colours so the traffic feels authentic (not a clone army)
const NPC_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x2c3e50, 0xe67e22, 0x7f8c8d];

function makeNpcCar(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const color = NPC_COLORS[Math.floor(rng() * NPC_COLORS.length)];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 4.2),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.5;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x444c55 }),
  );
  cabin.position.set(0, 1.0, 0.1);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]] as [number, number][]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.32, z);
    g.add(w);
  }
  return g;
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
