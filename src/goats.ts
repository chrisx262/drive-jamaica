import * as THREE from 'three';
import { makeGoat } from './animals';
import { narrate } from './narrator';
import type { RoadLike, RouteSegment } from './road';
import type { Car } from './car';

const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 6;
const GOAT_SPEED = 1.4;        // m/s — ambling across the road
const HIT_RADIUS = 1.8;        // meters — collision range per goat
const SPREAD = 2.2;            // lateral spread within a herd
const CROSS_DISTANCE = 14;     // meters a goat walks before it's "across"
const SCORE_PENALTY = 50;

// Goat herds cross on the Linstead→Moneague country road stretch (and nearby segments).
const GOAT_SEGMENTS = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
];

// Herd spawns on one side of the road and walks to the other.
// Once all goats are across, the herd is done for the session.
interface GoatInstance {
  obj: THREE.Group;
  pos: THREE.Vector3;
  dir: THREE.Vector3;    // crossing direction (perpendicular to road)
  crossed: number;       // meters crossed so far
  done: boolean;
  hit: boolean;
}

interface Herd {
  goats: GoatInstance[];
  active: boolean;
  triggered: boolean;    // did the car enter trigger range?
  spawnCenter: THREE.Vector3;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  private scoreDelta = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4517);

    // Collect eligible point ranges from goat segments
    const eligibleRanges: Array<RouteSegment> = road.segments.filter((s) =>
      GOAT_SEGMENTS.some((name) => s.name.includes(name))
    );

    if (eligibleRanges.length === 0) return;

    // Place herds every 800–2000 m along the eligible stretches
    for (const seg of eligibleRanges) {
      const pts = road.points;
      let segDist = 0;
      for (let i = seg.from + 1; i <= seg.to && i < pts.length; i++) {
        segDist += pts[i - 1].distanceTo(pts[i]);
      }

      let nextAt = 400 + rng() * 600;
      let travelled = 0;

      for (let i = seg.from + 1; i <= seg.to && i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const step = a.distanceTo(b);
        while (travelled + step >= nextAt) {
          const t = (nextAt - travelled) / step;
          const center = a.clone().lerp(b, t);
          center.y = 0;
          const fwd = b.clone().sub(a).normalize();
          // Crossing direction: perpendicular to road; side chosen at random
          const side = rng() < 0.5 ? 1 : -1;
          const crossDir = new THREE.Vector3(fwd.z * side, 0, -fwd.x * side);

          const count = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
          const herd: Herd = { goats: [], active: false, triggered: false, spawnCenter: center.clone() };

          for (let g = 0; g < count; g++) {
            const obj = makeGoat();
            // Stagger start positions slightly along and across the road edge
            const along = (rng() - 0.5) * SPREAD * 1.5;
            const across = (rng() - 0.5) * SPREAD;
            const startPos = center.clone()
              .addScaledVector(fwd, along)
              .addScaledVector(crossDir, -CROSS_DISTANCE / 2 + across - 2); // start off the road edge
            startPos.y = 0;
            obj.position.copy(startPos);
            // Face direction of travel
            obj.rotation.y = Math.atan2(crossDir.x, crossDir.z);
            this.object.add(obj);
            herd.goats.push({ obj, pos: startPos.clone(), dir: crossDir.clone(), crossed: g * 0.8, done: false, hit: false });
          }

          this.herds.push(herd);
          nextAt += 800 + rng() * 1200;
        }
        travelled += step;
      }
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      // Activate when car is within 80 m of the herd center
      if (!herd.triggered && carPos.distanceTo(herd.spawnCenter) < 80) {
        herd.triggered = true;
        herd.active = true;
      }

      if (!herd.active) continue;

      let allDone = true;
      for (const g of herd.goats) {
        if (g.done) continue;
        allDone = false;

        // Animate crossing
        g.crossed += GOAT_SPEED * dt;
        g.pos.addScaledVector(g.dir, GOAT_SPEED * dt);
        g.obj.position.copy(g.pos);

        // Waddle animation
        g.obj.rotation.z = Math.sin(g.crossed * 3.5) * 0.08;

        if (g.crossed >= CROSS_DISTANCE) {
          g.done = true;
          continue;
        }

        // Collision check
        if (!g.hit && g.pos.distanceTo(carPos) < HIT_RADIUS) {
          g.hit = true;
          g.done = true;
          this.scoreDelta -= SCORE_PENALTY;
          narrate('goat.hit');
          // Knock the goat visually off-road
          g.obj.rotation.z = Math.PI / 2;
        }
      }

      if (allDone) herd.active = false;
    }

    // Narrate a near-miss: car passed through herd zone without hitting
    for (const herd of this.herds) {
      if (!herd.triggered || herd.active) continue;
      const anyHit = herd.goats.some((g) => g.hit);
      const anyMissed = herd.goats.some((g) => !g.hit);
      if (!anyHit && anyMissed && carPos.distanceTo(herd.spawnCenter) > 25 && carPos.distanceTo(herd.spawnCenter) < 60) {
        narrate('goat.miss');
        herd.triggered = false; // prevent re-firing
      }
    }
  }

  get pendingScoreDelta(): number {
    const delta = this.scoreDelta;
    this.scoreDelta = 0;
    return delta;
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
