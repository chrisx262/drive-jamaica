import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross the country road on the Linstead–Moneague stretch.
// Each herd waits in a dormant state off-road, then activates (walks across)
// when the car approaches. Hitting a goat fires a narrator scolding.
// Near-miss fires a lighter comment.

const GOAT_ROAD_SEGS: string[] = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
];

const ACTIVATE_DIST   = 60;   // m — herd starts crossing when car is this close
const HIT_RADIUS      = 1.8;  // m — car vs goat collision
const NEAR_MISS_DIST  = 4.5;  // m — counts as near miss (but not a hit)
const CROSS_SPEED     = 1.6;  // m/s — goats amble, never hurry
const HERD_MIN        = 3;
const HERD_MAX        = 5;
// Stagger goats across the road width (compressed world road is ~8 m wide)
const SPREAD_LATERAL  = 2.8;  // m between goats along the road

interface Goat {
  mesh: THREE.Group;
  hit: boolean;
}

interface Herd {
  goats: Goat[];
  crossDir: THREE.Vector3; // unit vector perpendicular to road, direction of crossing
  active: boolean;
  done: boolean;
  startX: number; // road-centre x (world) — used to decide "past" condition
  startZ: number;
  nearMissFired: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(7373);

    for (const seg of road.segments) {
      if (!GOAT_ROAD_SEGS.some((s) => seg.name.includes(s))) continue;

      const span = seg.to - seg.from;
      // One herd roughly every 20 route-points
      const count = Math.max(1, Math.floor(span / 20));
      for (let i = 0; i < count; i++) {
        const idx = seg.from + 2 + Math.floor(rng() * Math.max(1, span - 3));
        if (idx >= road.points.length - 1) continue;

        const centre = road.points[idx].clone();
        const fwd    = road.points[idx + 1].clone().sub(centre).normalize();
        const perp   = new THREE.Vector3(-fwd.z, 0, fwd.x); // left of road

        // Herd starts on the left side, walks to the right
        const crossDir = perp.clone().negate(); // right → left means car goes left; let's have them cross right-to-left so they appear from driver's left
        // Actually from the driver's perspective on the left lane: left of road is the oncoming lane edge.
        // Let's have goats come from the right shoulder (driver's right = perp negated side)
        const startSide = perp.clone().multiplyScalar(10); // start 10 m off road to the left

        const herdSize = HERD_MIN + Math.floor(rng() * (HERD_MAX - HERD_MIN + 1));
        const goats: Goat[] = [];

        for (let g = 0; g < herdSize; g++) {
          const mesh = makeGoat();
          // Stagger along fwd direction
          const offset = (g - (herdSize - 1) / 2) * SPREAD_LATERAL;
          const pos = centre.clone()
            .add(startSide)
            .addScaledVector(fwd, offset)
            .addScaledVector(perp, (rng() - 0.5) * 1.5); // small random scatter
          pos.y = 0;
          mesh.position.copy(pos);
          // Face in the crossing direction
          const facePt = pos.clone().add(crossDir);
          mesh.lookAt(facePt.x, 0, facePt.z);
          this.object.add(mesh);
          goats.push({ mesh, hit: false });
        }

        this.herds.push({
          goats,
          crossDir: crossDir.clone(),
          active: false,
          done: false,
          startX: centre.x,
          startZ: centre.z,
          nearMissFired: false,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.done) continue;

      // Check activation
      if (!herd.active) {
        for (const g of herd.goats) {
          if (g.mesh.position.distanceTo(car.position) < ACTIVATE_DIST) {
            herd.active = true;
            break;
          }
        }
        if (!herd.active) continue;
      }

      // Move each goat across
      let allAcross = true;
      for (const g of herd.goats) {
        if (g.hit) continue;
        const dist = g.mesh.position.distanceTo(car.position);

        if (dist < HIT_RADIUS) {
          g.hit = true;
          narrate('goat.hit');
          g.mesh.rotation.z = Math.PI / 3; // knocked sideways
          continue;
        }

        // Near-miss check
        if (!herd.nearMissFired && dist < NEAR_MISS_DIST) {
          herd.nearMissFired = true;
          narrate('goat.nearMiss');
        }

        // Walk across
        g.mesh.position.addScaledVector(herd.crossDir, CROSS_SPEED * dt);
        // Done when 20 m past centre on the other side
        const crossed = g.mesh.position.clone().sub(new THREE.Vector3(herd.startX, 0, herd.startZ));
        if (crossed.dot(herd.crossDir) < 20) allAcross = false;
      }

      if (allAcross) herd.done = true;
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
