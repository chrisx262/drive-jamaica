import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herds cross country roads unattended on the Linstead–Moneague stretch.
// Hitting one bursts the tyre (damage) and earns a narrator scolding.

const COUNTRY_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

const HERD_SIZE_MIN = 2;
const HERD_SIZE_MAX = 5;
const CROSSING_SPEED = 0.9;  // m/s — goats amble, they don't hurry
const HIT_RADIUS = 1.8;      // m
const HERD_SPACING = 220;    // min meters between herds
const ROAD_HALF = 4;         // half of ROAD_WIDTH from road.ts

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(5577);
    const pts = road.points;

    for (const seg of road.segments) {
      if (!COUNTRY_SEGMENTS.has(seg.name)) continue;
      let distSinceLast = HERD_SPACING * rng();
      for (let i = seg.from + 1; i < seg.to; i++) {
        const step = pts[i - 1].distanceTo(pts[i]);
        distSinceLast += step;
        if (distSinceLast < HERD_SPACING) continue;
        distSinceLast = 0;

        const dir = pts[i].clone().sub(pts[i - 1]).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        // Goats cross from one verge to the other — random side each herd
        const startSide = rng() > 0.5 ? 1 : -1;
        const crossDir = perp.clone().multiplyScalar(startSide);
        const count = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));

        const goats: THREE.Group[] = [];
        for (let g = 0; g < count; g++) {
          const mesh = makeGoat();
          const jitter = new THREE.Vector3((rng() - 0.5) * 3, 0, (rng() - 0.5) * 3);
          const startPos = pts[i].clone()
            .addScaledVector(crossDir, -(ROAD_HALF + 6 + g * 1.5))
            .add(jitter);
          startPos.y = 0;
          mesh.position.copy(startPos);
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);
          goats.push(mesh);
        }
        this.herds.push({ goats, crossDir, hit: false });
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      for (const goat of herd.goats) {
        goat.position.addScaledVector(herd.crossDir, CROSSING_SPEED * dt);
        goat.position.y = 0;

        if (!herd.hit && goat.position.distanceTo(carPos) < HIT_RADIUS) {
          herd.hit = true;
          car.burstTyre();
          narrate('goat.hit');
        }
      }
    }
  }
}

interface GoatHerd {
  goats: THREE.Group[];
  crossDir: THREE.Vector3;
  hit: boolean;
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
