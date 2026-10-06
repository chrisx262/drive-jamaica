import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Country road segments between Linstead and Ocho Rios where goat herds appear.
const COUNTRY_PATTERNS = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
  'Milford Road',
];

const HIT_RADIUS = 2.2;
const HERD_MIN = 3;
const HERD_MAX = 6;
const DRIFT_SPEED = 1.1;   // m/s — slow cross-road ambling
const MIN_HERD_GAP = 1100; // compressed-world meters between herds

interface GoatEntry {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  driftDir: THREE.Vector3;
  hit: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private goats: GoatEntry[] = [];
  goatsHit = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const segName: string[] = new Array(road.points.length).fill('');
    for (const seg of road.segments) {
      for (let i = seg.from; i < seg.to; i++) segName[i] = seg.name;
    }

    let nextAt = 500;
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const isCountry = COUNTRY_PATTERNS.some((p) => segName[i].includes(p));
      if (!isCountry) {
        travelled += road.points[i - 1].distanceTo(road.points[i]);
        continue;
      }

      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Goats drift perpendicular to the road — crossing the player's path.
        const perp = new THREE.Vector3(dir.z, 0, -dir.x);
        const driftDir = perp.clone().multiplyScalar(rng() > 0.5 ? 1 : -1);

        const herdSize = HERD_MIN + Math.floor(rng() * (HERD_MAX - HERD_MIN + 1));
        for (let g = 0; g < herdSize; g++) {
          const scatter = new THREE.Vector3((rng() - 0.5) * 7, 0, (rng() - 0.5) * 7);
          const pos = a.clone().lerp(b, t).add(scatter);
          pos.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(-driftDir.x, -driftDir.z);
          this.object.add(mesh);
          this.goats.push({ mesh, pos: pos.clone(), driftDir: driftDir.clone(), hit: false });
        }
        nextAt += MIN_HERD_GAP + rng() * MIN_HERD_GAP;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    for (const goat of this.goats) {
      if (goat.hit) continue;

      // Goats amble slowly across the road
      goat.pos.addScaledVector(goat.driftDir, DRIFT_SPEED * dt);
      goat.mesh.position.copy(goat.pos);

      if (goat.pos.distanceTo(car.position) < HIT_RADIUS) {
        goat.hit = true;
        this.goatsHit++;
        narrate('goat.hit');
      }
    }
  }

  get count(): number {
    return this.goats.length;
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
