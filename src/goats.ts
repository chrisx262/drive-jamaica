import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const HIT_RADIUS = 1.8;       // world units — car centre to goat centre
const CROSS_SPEED = 2.2;      // world units/s the herd crosses
const TRIGGER_RADIUS = 40;    // car must come within this for herd to start crossing
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 6;
const HERDS_PER_SEGMENT = 2;

// Country road segments where goat herds roam (Linstead–Moneague stretch).
const GOAT_SEGMENT_NAMES = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
];

interface Goat {
  object: THREE.Group;
  offset: number;   // lateral spread within herd
  hit: boolean;
}

interface GoatHerd {
  goats: Goat[];
  spawnPos: THREE.Vector3;
  crossDir: THREE.Vector3; // perpendicular to road
  crossing: boolean;
  done: boolean;
}

// Goat herds cross country roads unattended. Hitting one costs a score penalty
// and triggers narrator scolding. One line per goat hit.
export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const goatSegments = road.segments.filter((s) =>
      GOAT_SEGMENT_NAMES.includes(s.name)
    );

    for (const seg of goatSegments) {
      const span = seg.to - seg.from;
      for (let h = 0; h < HERDS_PER_SEGMENT; h++) {
        const t = (h + 0.5 + (rng() - 0.5) * 0.6) / HERDS_PER_SEGMENT;
        const idx = seg.from + Math.floor(t * (span - 2));
        const a = road.points[idx];
        const b = road.points[idx + 1] ?? a;
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        // Cross direction: right-to-left or left-to-right randomly
        const crossDir = perp.clone().multiplyScalar(rng() > 0.5 ? 1 : -1);

        // Spawn point is to the side of the road, on the opposite side from crossing
        const startLateral = crossDir.clone().multiplyScalar(-9);
        const spawnPos = a.clone().add(startLateral);

        const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        const goats: Goat[] = [];

        for (let g = 0; g < herdSize; g++) {
          const offset = (g - (herdSize - 1) / 2) * 1.5;
          const pos = spawnPos.clone().add(dir.clone().multiplyScalar(offset));
          pos.y = 0;
          const mesh = makeGoat();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
          this.object.add(mesh);
          goats.push({ object: mesh, offset, hit: false });
        }

        this.herds.push({ goats, spawnPos, crossDir, crossing: false, done: false });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.done) continue;

      if (!herd.crossing) {
        // Trigger when car is close enough
        const ref = herd.goats[0]?.object.position;
        if (ref && ref.distanceToSquared(car.position) < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          herd.crossing = true;
        }
        continue;
      }

      let allCrossed = true;
      const step = herd.crossDir.clone().multiplyScalar(CROSS_SPEED * dt);
      for (const g of herd.goats) {
        if (g.hit) continue;
        // Check hit before moving
        if (g.object.position.distanceToSquared(car.position) < HIT_RADIUS * HIT_RADIUS) {
          g.hit = true;
          g.object.visible = false; // goat knocked aside — visual placeholder
          narrate('goat.hit');
          continue;
        }
        // Move across the road
        const crossed = g.object.position.clone().sub(herd.spawnPos).dot(herd.crossDir);
        if (crossed < 20) {
          g.object.position.add(step);
          allCrossed = false;
        }
      }
      if (allCrossed) herd.done = true;
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
