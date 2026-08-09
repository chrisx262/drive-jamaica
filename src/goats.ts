import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const CROSS_TRIGGER = 80; // m — herd starts crossing when car is this close
const HIT_RADIUS = 1.8; // m — car hits a goat
const GOAT_SPEED = 2.2; // m/s — lazy walking pace
const REPAIR_DELAY = 7_000; // ms — auto-repair after goat hit
const HERD_SIZE = 5;
const HERD_MIN_SPACING = 120; // m between herds within a segment

// Country road segments where goat herds cross unattended (Linstead–Moneague stretch).
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
]);

interface Goat {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  crossDir: THREE.Vector3;
  crossing: boolean;
  done: boolean;
}

interface Herd {
  goats: Goat[];
  triggered: boolean;
  center: THREE.Vector3;
}

// Goat herds cross country roads unattended. Hitting one: tyre burst + score
// penalty + narrator scolding. First hit uses a stronger narrator line.
export class Goats {
  readonly object: THREE.Group;
  private readonly herds: Herd[] = [];
  private firstHitDone = false;
  private repairTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);
    const pts = road.points;

    for (const seg of road.segments) {
      if (!GOAT_SEGMENTS.has(seg.name)) continue;

      let distInSeg = 0;
      let nextAt = HERD_MIN_SPACING * 0.4 + rng() * HERD_MIN_SPACING * 0.4;

      for (let i = seg.from; i < seg.to - 1 && i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const step = a.distanceTo(b);

        while (distInSeg + step >= nextAt) {
          const t = (nextAt - distInSeg) / step;
          const fwd = b.clone().sub(a).normalize();
          // Left perpendicular: left = +perp in left-hand traffic world
          const perp = new THREE.Vector3(-fwd.z, 0, fwd.x);
          // Goats start on LEFT roadside and cross toward the right (-perp)
          const crossDir = perp.clone().negate();
          const center = a.clone().lerp(b, t);

          const herd: Herd = { goats: [], triggered: false, center: center.clone() };

          for (let g = 0; g < HERD_SIZE; g++) {
            const alongOffset = (rng() - 0.5) * 6;
            const lateralOffset = 5.0 + rng() * 3.0; // 5–8 m left of road center
            const pos = center.clone()
              .addScaledVector(fwd, alongOffset)
              .addScaledVector(perp, lateralOffset);
            pos.y = 0;

            const mesh = makeGoat();
            mesh.position.copy(pos);
            mesh.rotation.y = rng() * Math.PI * 2;
            this.object.add(mesh);

            herd.goats.push({
              mesh,
              pos: pos.clone(),
              crossDir: crossDir.clone(),
              crossing: false,
              done: false,
            });
          }

          this.herds.push(herd);
          nextAt += HERD_MIN_SPACING + rng() * HERD_MIN_SPACING * 0.6;
        }
        distInSeg += step;
      }
    }
  }

  update(dt: number, car: Car): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      if (!herd.triggered && herd.center.distanceTo(carPos) < CROSS_TRIGGER) {
        herd.triggered = true;
        for (const g of herd.goats) g.crossing = true;
      }

      for (const goat of herd.goats) {
        if (!goat.crossing || goat.done) continue;

        goat.pos.addScaledVector(goat.crossDir, GOAT_SPEED * dt);
        goat.pos.y = 0;
        goat.mesh.position.copy(goat.pos);
        goat.mesh.rotation.y = Math.atan2(-goat.crossDir.x, -goat.crossDir.z);

        // Goat is done when it's 12 m past the herd center on the cross side
        if (goat.pos.distanceTo(herd.center) > 12 &&
            goat.crossDir.dot(goat.pos.clone().sub(herd.center)) > 0) {
          goat.done = true;
          continue;
        }

        if (!car.tyreBurst && goat.pos.distanceTo(carPos) < HIT_RADIUS) {
          goat.done = true;
          car.burstTyre();
          if (!this.firstHitDone) {
            this.firstHitDone = true;
            narrate('goat.hit.first');
          } else {
            narrate('goat.hit');
          }
          clearTimeout(this.repairTimer);
          this.repairTimer = setTimeout(() => {
            car.repairTyre();
            narrate('tyre.fixed');
          }, REPAIR_DELAY);
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
