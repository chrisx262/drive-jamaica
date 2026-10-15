import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const HIT_RADIUS = 1.8;       // meters — collision with car
const HERD_SIZE = 4;           // goats per herd
const HERD_SPREAD = 4.5;       // meters lateral spread
const CROSS_SPEED = 2.2;       // m/s — goat amble speed
const CROSS_TRIGGER = 45;      // meters — herd starts crossing when car is this far ahead

// Goat herds cross on country-road segments in the Linstead–Moneague belt.
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road', // first portion only (before Faith's Pen)
]);

const HERDS_PER_SEGMENT = 2;

type CrossDir = -1 | 1;

interface GoatHerd {
  meshes: THREE.Group[];
  spawnPos: THREE.Vector3;   // centre of herd when at rest
  crossDir: CrossDir;        // -1 or +1 across the road
  crossing: boolean;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];
  goatHits = 0; // queryable by scoring module

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(9988);

    let herdIdx = 0;
    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;
      const spanLen = seg.to - seg.from;
      if (spanLen < 6) continue;

      for (let h = 0; h < HERDS_PER_SEGMENT; h++) {
        const frac = (h + 0.35 + rng() * 0.3) / HERDS_PER_SEGMENT;
        const ptIdx = Math.floor(seg.from + frac * spanLen);
        if (ptIdx >= road.points.length - 1) continue;

        const a = road.points[ptIdx];
        const b = road.points[ptIdx + 1];
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        // Park herd on the LEFT verge (left side of road in left-hand traffic)
        const spawnPos = a.clone().addScaledVector(perp, 7 + rng() * 3);
        spawnPos.y = 0;

        const crossDir: CrossDir = rng() > 0.5 ? 1 : -1;
        const meshes: THREE.Group[] = [];

        for (let i = 0; i < HERD_SIZE; i++) {
          const g = makeGoat();
          // Spread goats loosely around the spawn centre
          g.position.set(
            spawnPos.x + (rng() - 0.5) * HERD_SPREAD,
            0,
            spawnPos.z + (rng() - 0.5) * HERD_SPREAD,
          );
          g.rotation.y = Math.atan2(perp.x * crossDir, perp.z * crossDir);
          g.userData.offsetX = (rng() - 0.5) * HERD_SPREAD;
          g.userData.offsetZ = (rng() - 0.5) * HERD_SPREAD;
          this.object.add(g);
          meshes.push(g);
        }

        this.herds.push({ meshes, spawnPos, crossDir, crossing: false, hit: false });
        herdIdx++;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.hit) continue;

      if (!herd.crossing) {
        // Trigger when car approaches from behind the herd along the road
        const toCar = carPos.clone().sub(herd.spawnPos).setY(0);
        if (toCar.length() < CROSS_TRIGGER) {
          herd.crossing = true;
        }
      }

      if (herd.crossing) {
        // Walk across; direction is the road perp scaled by crossDir
        const firstMesh = herd.meshes[0];
        const dx = firstMesh.position.x - herd.spawnPos.x;
        const dz = firstMesh.position.z - herd.spawnPos.z;
        const crossDist = Math.sqrt(dx * dx + dz * dz);

        if (crossDist < 18) {
          // Still crossing
          const perpDir = new THREE.Vector3(-Math.sin(firstMesh.rotation.y), 0, -Math.cos(firstMesh.rotation.y));
          for (const g of herd.meshes) {
            g.position.addScaledVector(perpDir, CROSS_SPEED * dt);
            // Idle bob
            g.position.y = Math.abs(Math.sin(performance.now() / 300 + g.userData.offsetX)) * 0.08;
          }
        }

        // Collision check
        for (const g of herd.meshes) {
          if (g.position.distanceTo(carPos) < HIT_RADIUS) {
            herd.hit = true;
            this.goatHits++;
            narrate('goat.hit');
            // Visually scatter the herd
            for (const other of herd.meshes) {
              other.position.addScaledVector(
                new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
                4 + Math.random() * 4,
              );
            }
            break;
          }
        }
      }
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
