import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';
import goatConfig from '../data/goats.json';

// Exported so the debug overlay can draw hit spheres if needed.
export const HIT_RADIUS = goatConfig.hitRadius;

// Total perpendicular distance goats cross: verge-to-verge across the road.
const CROSS_DIST = 22; // world units

interface GoatData {
  mesh: THREE.Group;
  fwdOffset: number;   // scatter along road direction (fixed)
  startPerp: number;   // signed: which side + distance from road center at rest
  phaseDelay: number;  // 0..0.3 — individual stagger so goats don't all step in sync
  hit: boolean;
}

interface Herd {
  center: THREE.Vector3;   // point on road centerline where herd crosses
  dir: THREE.Vector3;      // road forward direction at this point
  perp: THREE.Vector3;     // road perpendicular (positive = right side)
  startSide: number;       // +1 or -1
  goats: GoatData[];
  crossProgress: number;   // -1 = waiting for car; 0..1 = crossing
  narrated: boolean;       // narrator fires once per herd hit
}

// Goat herds cross country roads on the Linstead–Moneague stretch. Hitting a
// goat costs one penalty point and triggers a narrator scolding. No effect on
// car physics — score only (hard guardrail: never touch Car constants).
export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  private _penaltyCount = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    const segmentNames = new Set(goatConfig.segments.map((s) => s.name));
    const goatRanges: Array<[number, number]> = [];
    for (const seg of road.segments) {
      if (segmentNames.has(seg.name)) goatRanges.push([seg.from, seg.to]);
    }

    const rng = mulberry32(2027);

    for (const [from, to] of goatRanges) {
      let dist = 0;
      let nextAt = goatConfig.minHerdGap + rng() * (goatConfig.maxHerdGap - goatConfig.minHerdGap);

      for (let i = from + 1; i < to && i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segLen = a.distanceTo(b);

        while (dist + segLen >= nextAt) {
          const t = (nextAt - dist) / segLen;
          const dir = b.clone().sub(a).normalize();
          // Right-side perpendicular (positive = right when facing road direction).
          const perp = new THREE.Vector3(-dir.z, 0, dir.x);
          const center = a.clone().lerp(b, t);
          center.y = 0;

          const startSide = rng() < 0.5 ? 1 : -1;
          const herdSize =
            goatConfig.herdSizeMin +
            Math.floor(rng() * (goatConfig.herdSizeMax - goatConfig.herdSizeMin + 1));

          const herd: Herd = {
            center,
            dir: dir.clone(),
            perp: perp.clone(),
            startSide,
            goats: [],
            crossProgress: -1,
            narrated: false,
          };

          // Goats face the direction they'll cross: from startSide toward -startSide.
          // rotation.y = atan2(crossDir.x, crossDir.z) where goat model faces +Z.
          const crossAngle = Math.atan2(
            -perp.x * startSide,
            -perp.z * startSide
          );

          for (let g = 0; g < herdSize; g++) {
            const fwdOffset = (rng() - 0.5) * 8;
            // Start position: on the verge, 11–14 wu from road center.
            const perpDist = 11 + rng() * 3;
            const startPerp = startSide * perpDist;
            const phaseDelay = rng() * 0.3;

            const mesh = makeGoat();
            const pos = center.clone()
              .addScaledVector(dir, fwdOffset)
              .addScaledVector(perp, startPerp);
            pos.y = 0;
            mesh.position.copy(pos);
            mesh.rotation.y = crossAngle;
            this.object.add(mesh);

            herd.goats.push({ mesh, fwdOffset, startPerp, phaseDelay, hit: false });
          }

          this.herds.push(herd);
          nextAt += goatConfig.minHerdGap + rng() * (goatConfig.maxHerdGap - goatConfig.minHerdGap);
        }

        dist += segLen;
      }
    }
  }

  /** Number of goats hit — displayed in HUD as a score penalty. */
  get penaltyCount(): number {
    return this._penaltyCount;
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    const now = performance.now() / 1000;

    for (const herd of this.herds) {
      // Wake the herd when the car gets close and is moving.
      if (herd.crossProgress < 0) {
        if (
          carPos.distanceTo(herd.center) < goatConfig.wakeRadius &&
          Math.abs(car.speed) > 0.5
        ) {
          herd.crossProgress = 0;
        } else {
          continue;
        }
      }

      // Advance crossing: CROSS_DIST / goatWalkSpeed seconds to fully cross.
      if (herd.crossProgress < 1) {
        herd.crossProgress = Math.min(
          1,
          herd.crossProgress + (goatConfig.goatWalkSpeed / CROSS_DIST) * dt
        );
      }

      for (const goat of herd.goats) {
        if (goat.hit) continue;

        // Individual goat lags behind the herd's overall progress.
        const local = THREE.MathUtils.clamp(
          (herd.crossProgress - goat.phaseDelay) / (1 - goat.phaseDelay),
          0,
          1
        );

        // Lerp from startPerp to -startPerp across CROSS_DIST.
        const perpOffset = goat.startPerp - 2 * goat.startPerp * local;
        const newPos = herd.center.clone()
          .addScaledVector(herd.dir, goat.fwdOffset)
          .addScaledVector(herd.perp, perpOffset);
        // Subtle leg-bob while crossing.
        newPos.y = local > 0 && local < 1
          ? Math.abs(Math.sin(now * 6 + goat.fwdOffset)) * 0.05
          : 0;
        goat.mesh.position.copy(newPos);

        // Hit detection.
        if (newPos.distanceToSquared(carPos) < HIT_RADIUS * HIT_RADIUS) {
          goat.hit = true;
          // Topple sideways — visual only, does not affect car.
          goat.mesh.rotation.z = Math.PI / 2;
          goat.mesh.position.y = 0.35;
          this._penaltyCount++;
          if (!herd.narrated) {
            narrate('goat.hit');
            herd.narrated = true;
          }
        }
      }
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
