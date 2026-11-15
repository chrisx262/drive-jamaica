import * as THREE from 'three';
import { makeGoat } from './animals';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herd crossings on the Linstead–Moneague country stretch (GAME_SPEC.md).
// Herds of 3–6 unattended goats walk across the road. Hitting one:
//   - car slows briefly (impulse) + score penalty
//   - narrator fires "goat.hit"
// Near-miss (passes within NEARMISS_RADIUS without touching):
//   - narrator fires "goat.nearmiss" (once per herd crossing)

const HIT_RADIUS = 1.1;       // metres
const NEARMISS_RADIUS = 2.8;  // metres — tighter than pothole, goats are small
const GOAT_SPEED = 1.4;       // m/s — meandering
const RESET_AFTER = 25_000;   // ms — herd resets to its home after clearing
const HIT_SLOW = 0.42;        // multiplier applied to car speed on impact

// Compressed-world route fractions for herd crossing zones.
// These sit in the Linstead–Moneague leg (~0.52–0.63 route fraction).
const CROSSINGS: { t: number; width: number; herdSize: number; seed: number }[] = [
  { t: 0.545, width: 7.0, herdSize: 4, seed: 1 },
  { t: 0.571, width: 6.5, herdSize: 5, seed: 2 },
  { t: 0.592, width: 7.5, herdSize: 3, seed: 3 },
  { t: 0.608, width: 6.0, herdSize: 6, seed: 4 },
];

import type { RoadLike } from './road';

function pointAtFraction(road: RoadLike, t: number): THREE.Vector3 {
  const pts = road.points;
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i - 1].distanceTo(pts[i]); lens.push(l); total += l; }
  let target = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i]) return pts[i].clone().lerp(pts[i + 1], target / lens[i]);
    target -= lens[i];
  }
  return pts[pts.length - 1].clone();
}

function directionAtFraction(road: RoadLike, t: number): THREE.Vector3 {
  const pts = road.points;
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i - 1].distanceTo(pts[i]); lens.push(l); total += l; }
  let target = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i]) return pts[i + 1].clone().sub(pts[i]).normalize();
    target -= lens[i];
  }
  return pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
}

interface Goat {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  offset: THREE.Vector3;  // start position relative to herd anchor (left verge)
  walkPhase: number;
}

interface Herd {
  anchor: THREE.Vector3;
  crossDir: THREE.Vector3;  // unit vector across the road
  goats: Goat[];
  active: boolean;
  crossed: boolean;
  hitRegistered: boolean;
  nearmissRegistered: boolean;
  resetTimer: ReturnType<typeof setTimeout> | undefined;
}

function mulberry32(seed: number) {
  let a = seed * 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    for (const { t, width, herdSize, seed } of CROSSINGS) {
      const rng = mulberry32(seed);
      const anchor = pointAtFraction(road, t).clone();
      const fwd = directionAtFraction(road, t);
      // Cross direction: perpendicular to road (left-to-right relative to travel direction).
      // On left-hand-drive roads goats cross from the right verge toward left.
      const crossDir = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

      const herd: Herd = {
        anchor,
        crossDir,
        goats: [],
        active: true,
        crossed: false,
        hitRegistered: false,
        nearmissRegistered: false,
        resetTimer: undefined,
      };

      for (let i = 0; i < herdSize; i++) {
        // Start goats spread along the right verge, staggered across
        const along = fwd.clone().multiplyScalar((rng() - 0.5) * width);
        const across = crossDir.clone().multiplyScalar(-(3.5 + rng() * 2.5)); // right verge
        const offset = along.add(across);

        const mesh = makeGoat();
        mesh.position.copy(anchor.clone().add(offset));
        mesh.position.y = 0;
        mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z) + (rng() - 0.5) * 0.4;
        this.object.add(mesh);

        herd.goats.push({ mesh, home: mesh.position.clone(), offset, walkPhase: rng() * Math.PI * 2 });
      }

      this.herds.push(herd);
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (!herd.active) continue;

      let allCrossed = true;

      for (const goat of herd.goats) {
        // Walk across the road
        const step = herd.crossDir.clone().multiplyScalar(GOAT_SPEED * dt);
        goat.mesh.position.add(step);

        // Leg-bob animation
        goat.walkPhase += dt * 3.5;
        goat.mesh.position.y = Math.abs(Math.sin(goat.walkPhase)) * 0.05;

        // Check if this goat is still on the road (< 4.5 m from start cross position)
        const crossProgress = goat.mesh.position.clone().sub(goat.home).dot(herd.crossDir);
        if (crossProgress < 9.0) allCrossed = false;

        // Hit detection
        const dSq = goat.mesh.position.distanceToSquared(car.position);
        if (!herd.hitRegistered && dSq < HIT_RADIUS * HIT_RADIUS) {
          herd.hitRegistered = true;
          car.applyImpact(HIT_SLOW);
          narrate('goat.hit');
        } else if (!herd.nearmissRegistered && !herd.hitRegistered && dSq < NEARMISS_RADIUS * NEARMISS_RADIUS) {
          herd.nearmissRegistered = true;
          narrate('goat.nearmiss');
        }
      }

      if (allCrossed && !herd.crossed) {
        herd.crossed = true;
        clearTimeout(herd.resetTimer);
        herd.resetTimer = setTimeout(() => this.resetHerd(herd), RESET_AFTER);
      }
    }
  }

  private resetHerd(herd: Herd): void {
    herd.active = true;
    herd.crossed = false;
    herd.hitRegistered = false;
    herd.nearmissRegistered = false;
    for (const goat of herd.goats) {
      goat.mesh.position.copy(goat.home);
      goat.mesh.position.y = 0;
    }
  }
}
