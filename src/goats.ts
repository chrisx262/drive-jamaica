import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

const TRIGGER_RADIUS  = 35;  // metres — car approaches, herd starts crossing
const HIT_RADIUS      = 1.8; // metres — car overlaps a goat → collision
const CROSSING_SPEED  = 2.2; // m/s — unrushed country goat
const HIT_SLOWDOWN    = 0.45; // multiplier applied to car.speed on collision
const HERD_SIZE_MIN   = 3;
const HERD_SIZE_MAX   = 6;

// Country road segments between Linstead and Moneague where goats roam free
const GOAT_SEGMENT_KEYWORDS = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Hibiscus Drive',
];

function isGoatSegment(name: string): boolean {
  return GOAT_SEGMENT_KEYWORDS.some((k) => name.includes(k));
}

type CrossingState = 'waiting' | 'crossing' | 'done';

interface GoatHerd {
  goats: { mesh: THREE.Group; pos: THREE.Vector3; offset: number }[];
  startPos: THREE.Vector3;
  crossDir: THREE.Vector3;
  state: CrossingState;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0x90a75_90a7);

    // One herd every 250-450 m of goat-segment road
    let nextAt = 250;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !isGoatSegment(seg.name)) { nextAt = 250; travelled = 0; continue; }

      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const roadPt = a.clone().lerp(b, t);

        // Herd starts on left side, crosses to right (or vice versa)
        const side = rng() > 0.5 ? 1 : -1;
        const crossDir = perp.clone().multiplyScalar(-side); // crosses road
        const size = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));

        const goatList: GoatHerd['goats'] = [];
        for (let g = 0; g < size; g++) {
          const mesh = makeGoat();
          // Stagger start positions: beside road and slightly fore/aft
          const along = (rng() - 0.5) * 6;
          const across = 8 + rng() * 4; // start off-road
          const startPos = roadPt.clone()
            .addScaledVector(dir, along)
            .addScaledVector(perp, side * across);
          startPos.y = 0;
          mesh.position.copy(startPos);
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);
          goatList.push({ mesh, pos: startPos.clone(), offset: along });
        }

        const herd: GoatHerd = {
          goats: goatList,
          startPos: roadPt.clone(),
          crossDir: crossDir.normalize(),
          state: 'waiting',
          hit: false,
        };
        this.herds.push(herd);
        nextAt += 250 + rng() * 200;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.state === 'done') continue;

      if (herd.state === 'waiting') {
        if (herd.startPos.distanceTo(carPos) < TRIGGER_RADIUS) {
          herd.state = 'crossing';
        }
        continue;
      }

      // Crossing: move each goat across the road
      let allAcross = true;
      for (const goat of herd.goats) {
        const step = herd.crossDir.clone().multiplyScalar(CROSSING_SPEED * dt);
        goat.pos.add(step);
        goat.mesh.position.copy(goat.pos);
        // Done when 20 m past road centre
        if (goat.pos.distanceTo(herd.startPos) < 20) allAcross = false;
      }
      if (allAcross) { herd.state = 'done'; continue; }

      // Collision check — car clips a crossing goat
      if (!herd.hit && car.speed > 1) {
        for (const goat of herd.goats) {
          if (goat.pos.distanceTo(carPos) < HIT_RADIUS) {
            herd.hit = true;
            car.speed *= HIT_SLOWDOWN;
            narrate('goat.hit');
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
