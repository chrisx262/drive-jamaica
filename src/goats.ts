import * as THREE from 'three';
import { makeGoat } from './animals';
import type { Car } from './car';
import type { RoadLike } from './road';
import { narrate } from './narrator';

// Goat herds cross country roads unattended (Linstead-Moneague stretch).
// Hitting a goat triggers narrator scolding. Near-miss also has a line.
// Score penalties hook in here later (see GAME_SPEC scoring: goats spared).
const HERD_COUNT = 4; // number of goat herds along the goat stretch
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 5;
const TRIGGER_DIST = 90; // m — herd starts crossing when car gets this close
const CROSS_SPEED = 1.6; // m/s — goats amble across unhurried
const HIT_RADIUS = 1.6; // m — contact detection
const ROAD_WIDTH = 8;

// Goats only cross on the open country stretch (Linstead to Moneague)
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface Goat {
  mesh: THREE.Group;
  active: boolean;
  hit: boolean;
  dir: THREE.Vector3; // crossing direction
  target: THREE.Vector3; // opposite side of the road
}

interface Herd {
  goats: Goat[];
  triggered: boolean;
  done: boolean;
  nearMissNarrated: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0x90a7);
    const pts = road.points;

    // Collect points in the goat stretch
    const goatIndices: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const seg = road.segments.find((s) => i > s.from && i <= s.to);
      if (seg && GOAT_SEGMENTS.has(seg.name)) goatIndices.push(i);
    }

    if (goatIndices.length < 2) return;

    // Spread HERD_COUNT herds evenly through the stretch
    for (let h = 0; h < HERD_COUNT; h++) {
      const idx = goatIndices[Math.floor((h + 0.5) * goatIndices.length / HERD_COUNT)];
      const a = pts[idx - 1];
      const b = pts[idx];
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x); // perpendicular: right → left when driving
      const roadCenter = a.clone().lerp(b, 0.5);

      // Starting position: goats begin on the right shoulder, spread in a cluster
      const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
      const crossDir = perp.clone(); // cross from right to left
      const startLateral = ROAD_WIDTH / 2 + 1.5;
      const endLateral = -(ROAD_WIDTH / 2 + 3);

      const goats: Goat[] = [];
      for (let g = 0; g < herdSize; g++) {
        const mesh = makeGoat();
        const scatter = new THREE.Vector3(
          (rng() - 0.5) * 2.5,
          0,
          (rng() - 0.5) * 2.5
        );
        const startPos = roadCenter.clone()
          .addScaledVector(perp, startLateral)
          .addScaledVector(dir, (rng() - 0.5) * 6)
          .add(scatter);
        startPos.y = 0;
        mesh.position.copy(startPos);
        mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z) + (rng() - 0.5) * 0.3;

        const target = roadCenter.clone()
          .addScaledVector(perp, endLateral)
          .addScaledVector(dir, (rng() - 0.5) * 6)
          .add(scatter.multiplyScalar(-1));
        target.y = 0;

        this.object.add(mesh);
        goats.push({ mesh, active: false, hit: false, dir: crossDir.clone(), target });
      }
      this.herds.push({ goats, triggered: false, done: false, nearMissNarrated: false });
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      if (herd.done) continue;

      // Trigger: car enters range
      if (!herd.triggered) {
        const anyClose = herd.goats.some((g) => !g.hit && g.mesh.position.distanceTo(carPos) < TRIGGER_DIST);
        if (anyClose) {
          herd.triggered = true;
          for (const g of herd.goats) g.active = true;
        }
      }

      if (!herd.triggered) continue;

      let allDone = true;
      let anyOnRoad = false;
      let hitThisTick = false;

      for (const g of herd.goats) {
        if (g.hit) continue;

        const toTarget = g.target.clone().sub(g.mesh.position);
        toTarget.y = 0;
        if (toTarget.length() < 0.5) continue; // reached other side

        allDone = false;
        if (g.active) {
          // Check if goat is in road zone (lateral within half-road-width)
          const dx = g.mesh.position.x - carPos.x;
          const dz = g.mesh.position.z - carPos.z;
          if (Math.abs(dx) < ROAD_WIDTH && Math.abs(dz) < ROAD_WIDTH) anyOnRoad = true;

          // Hit detection
          if (g.mesh.position.distanceTo(carPos) < HIT_RADIUS) {
            g.hit = true;
            hitThisTick = true;
            // Bounce goat away
            const away = g.mesh.position.clone().sub(carPos).normalize();
            g.mesh.position.addScaledVector(away, 4);
            g.mesh.visible = false; // goat knocked off screen (cartoon style)
            narrate('goat.hit');
            continue;
          }

          toTarget.normalize();
          g.mesh.position.addScaledVector(toTarget, CROSS_SPEED * dt);
          g.mesh.rotation.y = Math.atan2(-toTarget.x, -toTarget.z);
        }
      }

      if (herd.triggered && !herd.nearMissNarrated && !hitThisTick && anyOnRoad) {
        const closestDist = Math.min(...herd.goats.filter((g) => !g.hit).map((g) => g.mesh.position.distanceTo(carPos)));
        if (closestDist < HIT_RADIUS * 3) {
          herd.nearMissNarrated = true;
          narrate('goat.near-miss');
        }
      }

      if (allDone) herd.done = true;
    }
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
