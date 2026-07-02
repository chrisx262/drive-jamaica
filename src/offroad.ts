import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Off-road mountain moment: wrong turn in the Moneague/Mount Rosser hill country.
// GAME_SPEC: "a wrong turn option in the hill country (Moneague/Mount Rosser stretch)
//  that becomes potholes-then-no-road on a mountainside."
//
// Module pattern matches potholes.ts — tiny public API, no physics constants touched.
// The car.burstTyre() call in phase 3 is intentional gameplay consequence.

const ON_ROAD_THRESHOLD = 6;  // metres from nearest road point → "on road"
const PHASE1_TIME = 4;        // s off-road → narrator warns, light bump
const PHASE2_TIME = 11;       // s → narrator escalates, heavier bump
const PHASE3_TIME = 19;       // s → tyre burst, maximum shake ("no road")
const ROAD_REPAIR_DELAY = 8;  // s back on road before off-road tyre burst auto-repairs
const ZONE_SEGMENT = 'Linstead - Moneague Road';

export class OffRoad {
  readonly object: THREE.Group;

  private allPoints: THREE.Vector3[];
  // Bounding box of the off-road zone (in x,z)
  private zoneXMin = Infinity;
  private zoneXMax = -Infinity;
  private zoneZMin = Infinity;
  private zoneZMax = -Infinity;

  private offTime = 0;
  private phase = 0;
  private repairTimer = 0;
  private burstFromOffRoad = false;

  constructor(road: Road) {
    this.object = new THREE.Group();
    this.allPoints = road.points;

    // Collect zone points and bounding box
    const zonePts: THREE.Vector3[] = [];
    for (const seg of road.segments) {
      if (seg.name !== ZONE_SEGMENT) continue;
      for (let i = seg.from; i < seg.to && i < road.points.length; i++) {
        const p = road.points[i];
        zonePts.push(p);
        if (p.x < this.zoneXMin) this.zoneXMin = p.x;
        if (p.x > this.zoneXMax) this.zoneXMax = p.x;
        if (p.z < this.zoneZMin) this.zoneZMin = p.z;
        if (p.z > this.zoneZMax) this.zoneZMax = p.z;
      }
    }

    if (zonePts.length < 20) return; // no zone data (test track)

    // Build the visible dirt fork that tempts the player off road
    const branchIdx = Math.floor(zonePts.length * 0.30);
    const branchPt = zonePts[branchIdx];
    const branchNext = zonePts[branchIdx + 1];
    if (branchPt && branchNext) {
      this.object.add(this.buildDirtFork(branchPt, branchNext));
      this.object.add(this.buildSignpost(branchPt, branchNext));
    }
  }

  // Narrow dirt track curving left off the main road and climbing into the hills.
  private buildDirtFork(origin: THREE.Vector3, next: THREE.Vector3): THREE.Mesh {
    const fwd = next.clone().sub(origin).normalize();
    const left = new THREE.Vector3(-fwd.z, 0, fwd.x); // left of road (away from main route)

    const N = 24;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      // Curves progressively leftward; rises ~20 m over 200 m lateral — steep mountain track
      pts.push(
        origin.clone()
          .addScaledVector(fwd, t * 45)
          .addScaledVector(left, t * t * 210)
          .add(new THREE.Vector3(0, t * t * 20, 0))
      );
    }

    const positions: number[] = [];
    const inds: number[] = [];
    const W = 3.5;
    for (let i = 0; i < pts.length; i++) {
      const d = new THREE.Vector3();
      if (i === 0) d.subVectors(pts[1], pts[0]);
      else if (i === pts.length - 1) d.subVectors(pts[i], pts[i - 1]);
      else d.subVectors(pts[i + 1], pts[i - 1]);
      d.normalize();
      const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(W / 2);
      const lp = pts[i].clone().add(side);
      const rp = pts[i].clone().sub(side);
      positions.push(lp.x, lp.y + 0.04, lp.z, rp.x, rp.y + 0.04, rp.z);
      if (i > 0) {
        const a = (i - 1) * 2;
        inds.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(inds);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x7d5a38, flatShading: true }));
  }

  // Weathered wooden signpost at the fork — "Mt. Rosser?" — the temptation.
  private buildSignpost(origin: THREE.Vector3, next: THREE.Vector3): THREE.Group {
    const fwd = next.clone().sub(origin).normalize();
    const left = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const pos = origin.clone().addScaledVector(left, 7);

    const g = new THREE.Group();

    const postMat = new THREE.MeshLambertMaterial({ color: 0x4e2e0e });
    const boardMat = new THREE.MeshLambertMaterial({ color: 0xb8874a });

    // Upright post
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.3, 0.15), postMat);
    post.position.set(pos.x, 1.15, pos.z);

    // Main arm pointing toward the fork
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), postMat);
    arm.position.set(pos.x + 0.65, 2.4, pos.z);
    arm.rotation.y = Math.atan2(-fwd.z, -fwd.x); // roughly toward the fork

    // Sign board
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.07), boardMat);
    board.position.set(pos.x + 0.75, 2.3, pos.z);
    board.rotation.y = arm.rotation.y;

    g.add(post, arm, board);
    return g;
  }

  // Returns camera-shake amplitude (0–0.5); main.ts multiplies by sin(t) and adds to camera Y.
  update(car: Car, dt: number): number {
    // Fast exit: no zone data or car outside zone bounding box (+ 250 m margin)
    if (
      this.zoneXMin === Infinity ||
      car.position.x < this.zoneXMin - 250 ||
      car.position.x > this.zoneXMax + 250 ||
      car.position.z < this.zoneZMin - 250 ||
      car.position.z > this.zoneZMax + 250
    ) {
      this.resetCarY(car);
      return 0;
    }

    // Find squared distance to nearest road point. Exit early once we know we're on-road.
    const threshold = ON_ROAD_THRESHOLD * ON_ROAD_THRESHOLD;
    let bestSq = Infinity;
    for (const p of this.allPoints) {
      const dx = p.x - car.position.x;
      const dz = p.z - car.position.z;
      const sq = dx * dx + dz * dz;
      if (sq < threshold) { bestSq = sq; break; } // on road — no need to search further
      if (sq < bestSq) bestSq = sq;
    }
    const isOffRoad = bestSq > threshold;

    if (!isOffRoad) {
      // Returning to road
      if (this.offTime >= PHASE1_TIME) {
        narrate('offroad.escape');
        if (this.burstFromOffRoad) {
          this.repairTimer = ROAD_REPAIR_DELAY;
          this.burstFromOffRoad = false;
        }
      }
      this.offTime = 0;
      this.phase = 0;
      this.resetCarY(car);

      // Count down off-road tyre repair
      if (this.repairTimer > 0) {
        this.repairTimer -= dt;
        if (this.repairTimer <= 0) {
          car.repairTyre();
          narrate('tyre.fixed');
          this.repairTimer = 0;
        }
      }
      return 0;
    }

    // Off road — accumulate time and escalate
    this.offTime += dt;

    if (this.phase < 3 && this.offTime >= PHASE3_TIME) {
      this.phase = 3;
      car.burstTyre();
      this.burstFromOffRoad = true;
      narrate('offroad.no-road');
    } else if (this.phase < 2 && this.offTime >= PHASE2_TIME) {
      this.phase = 2;
      narrate('offroad.rough');
    } else if (this.phase < 1 && this.offTime >= PHASE1_TIME) {
      this.phase = 1;
      narrate('offroad.enter');
    }

    // Camera shake ramps with phase
    let shake = 0;
    if (this.phase >= 3) shake = 0.50;
    else if (this.phase >= 2) shake = 0.28;
    else if (this.phase >= 1) shake = 0.10;

    // Visual Y-bump on car object (purely cosmetic — car.ts physics untouched)
    const freq = 45 - this.phase * 5;
    const amp = 0.06 + this.phase * 0.12;
    car.object.position.y = Math.abs(Math.sin(performance.now() / freq)) * amp;

    return shake;
  }

  private resetCarY(car: Car): void {
    if (car.object.position.y !== 0) car.object.position.y = 0;
  }
}
