import * as THREE from 'three';
import type { Car } from './car';
import type { RoadLike } from './road';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const HIT_RADIUS = 1.6;      // metres — close enough to count as a hit
const CROSS_SPEED = 1.8;     // m/s — goats are unhurried
const HERD_SIZE_MIN = 2;
const HERD_SIZE_MAX = 4;
// Goats appear on the Linstead-Moneague country road stretch (GAME_SPEC)
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);
const HERDS_PER_SEGMENT = 2;
const CROSS_DELAY_MIN = 3000; // ms before a goat starts crossing
const CROSS_DELAY_MAX = 8000;

type GoatState = 'waiting' | 'crossing' | 'done';

interface GoatEntry {
  mesh: THREE.Object3D;
  start: THREE.Vector3;
  end: THREE.Vector3;
  state: GoatState;
  delayMs: number;
  t: number;  // 0..1 lerp across the road
  hit: boolean;
}

// Goat herds: cross country roads unattended. Hitting one fires a narrator scolding.
export class Goats {
  readonly object: THREE.Group;
  private goats: GoatEntry[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;
      const segLen = seg.to - seg.from;
      if (segLen < 4) continue;

      for (let h = 0; h < HERDS_PER_SEGMENT; h++) {
        const center = seg.from + 2 + Math.floor(rng() * Math.max(1, segLen - 4));
        const ia = Math.max(0, center - 1);
        const ib = Math.min(road.points.length - 1, center + 1);
        const dir = road.points[ib].clone().sub(road.points[ia]).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        for (let j = 0; j < herdSize; j++) {
          const along = (rng() - 0.5) * 6;
          const startSide = rng() < 0.5 ? 1 : -1;
          const startOffset = perp.clone().multiplyScalar(startSide * (5 + rng() * 3));
          const endOffset = perp.clone().multiplyScalar(-startSide * (5 + rng() * 3));

          const start = road.points[center].clone()
            .addScaledVector(dir, along)
            .add(startOffset);
          start.y = 0;
          const end = road.points[center].clone()
            .addScaledVector(dir, along)
            .add(endOffset);
          end.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(start);
          mesh.rotation.y = rng() * Math.PI * 2;
          this.object.add(mesh);

          const delayMs = CROSS_DELAY_MIN + rng() * (CROSS_DELAY_MAX - CROSS_DELAY_MIN);
          this.goats.push({ mesh, start: start.clone(), end: end.clone(), state: 'waiting', delayMs, t: 0, hit: false });
        }
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const goat of this.goats) {
      if (goat.state === 'done') continue;

      if (goat.state === 'waiting') {
        goat.delayMs -= dt * 1000;
        if (goat.delayMs <= 0) {
          goat.state = 'crossing';
          const crossDir = goat.end.clone().sub(goat.start).normalize();
          goat.mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
        }
      } else if (goat.state === 'crossing') {
        const crossLen = goat.start.distanceTo(goat.end);
        goat.t = Math.min(1, goat.t + (CROSS_SPEED * dt) / Math.max(crossLen, 0.1));
        goat.mesh.position.lerpVectors(goat.start, goat.end, goat.t);

        if (!goat.hit && goat.mesh.position.distanceTo(car.position) < HIT_RADIUS) {
          goat.hit = true;
          narrate('goat.hit');
        }

        if (goat.t >= 1) goat.state = 'done';
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
