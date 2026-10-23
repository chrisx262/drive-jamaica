import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const HIT_RADIUS = 1.8;      // meters — car hits a goat
const CROSS_SPEED = 1.4;     // m/s — unhurried goat pace
const HERD_SIZE_MIN = 2;
const HERD_SIZE_MAX = 4;
const HERDS_ON_ROUTE = 6;    // total herds on the Linstead→Moneague stretch

// Goats cross the road unattended on country roads between Linstead and Moneague.
// Route fraction 0.60–0.78 covers that stretch (Linstead at ~60%, Moneague at ~78%).
const GOAT_STRETCH_START = 0.60;
const GOAT_STRETCH_END = 0.78;

interface GoatHerd {
  goats: GoatUnit[];
  crossing: boolean;
  crossDir: THREE.Vector3;   // unit vector perpendicular to road
  roadPoint: THREE.Vector3;  // centre of the road crossing point
}

interface GoatUnit {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  hit: boolean;
  offset: number; // stagger along cross direction
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4007);
    const total = road.points.length;
    const iStart = Math.floor(GOAT_STRETCH_START * total);
    const iEnd = Math.min(Math.floor(GOAT_STRETCH_END * total), total - 2);
    const span = iEnd - iStart;

    for (let h = 0; h < HERDS_ON_ROUTE; h++) {
      const idx = iStart + Math.floor(rng() * span);
      const pt = road.points[idx];
      const next = road.points[Math.min(idx + 1, total - 1)];
      const fwd = next.clone().sub(pt).setY(0).normalize();
      const perp = new THREE.Vector3(fwd.z, 0, -fwd.x); // perpendicular — goats cross this way

      const size = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
      const side = rng() < 0.5 ? 1 : -1; // which roadside the herd starts from
      const startLateral = side * (12 + rng() * 6);

      const goats: GoatUnit[] = [];
      for (let g = 0; g < size; g++) {
        const offset = g * 1.2; // stagger along crossing direction
        const pos = pt.clone()
          .addScaledVector(perp, startLateral + offset * side)
          .addScaledVector(fwd, (rng() - 0.5) * 4); // slight spread along road
        pos.y = 0;
        const mesh = makeGoat();
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(perp.x * side, perp.z * side);
        this.object.add(mesh);
        goats.push({ mesh, pos: pos.clone(), hit: false, offset });
      }

      this.herds.push({
        goats,
        crossing: false,
        crossDir: perp.clone().multiplyScalar(side),
        roadPoint: pt.clone(),
      });
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      // Start crossing when car is within 35 m of the road crossing point.
      if (!herd.crossing && herd.roadPoint.distanceTo(carPos) < 35) {
        herd.crossing = true;
      }
      if (!herd.crossing) continue;

      for (const goat of herd.goats) {
        if (goat.hit) continue;

        // Move across the road.
        goat.pos.addScaledVector(herd.crossDir, CROSS_SPEED * dt);
        goat.mesh.position.copy(goat.pos);

        // Collision check.
        if (goat.pos.distanceTo(carPos) < HIT_RADIUS) {
          goat.hit = true;
          // Small kick so the goat visually reacts.
          goat.mesh.position.y = 0.3;
          narrate('goat.hit');
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
