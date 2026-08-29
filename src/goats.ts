import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goats cross country roads between Linstead and Moneague — unattended.
const COUNTRY_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

const HERDS_PER_SEGMENT = 2;
const GOATS_PER_HERD    = 4;
const GOAT_SPEED        = 1.8;  // m/s — casual country amble
const HIT_RADIUS        = 2.0;  // m — car collision
const CROSSING_DIST     = 20;   // m total travel to clear the road
const TRIGGER_DIST      = 60;   // m — herd starts moving when car is this close

interface Goat {
  mesh: THREE.Group;
  hit: boolean;
}

interface GoatHerd {
  goats: Goat[];
  dir: THREE.Vector3;      // direction of crossing (perpendicular to road)
  trigger: THREE.Vector3;  // centroid for activation distance check
  active: boolean;
  done: boolean;
  dist: number;            // metres travelled
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];
  private _hits = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(7373);

    for (const seg of road.segments) {
      if (!COUNTRY_SEGMENTS.has(seg.name)) continue;
      const span = seg.to - seg.from;
      if (span < 2) continue;

      for (let h = 0; h < HERDS_PER_SEGMENT; h++) {
        const idx = seg.from + Math.floor(rng() * (span - 1));
        const a = road.points[idx];
        const b = road.points[Math.min(idx + 1, road.points.length - 1)];
        const fwd = b.clone().sub(a).normalize();
        const cross = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const startSide = rng() > 0.5 ? 1 : -1;
        const origin = a.clone().lerp(b, 0.3 + rng() * 0.4);
        origin.addScaledVector(cross, startSide * 7);
        origin.y = 0;

        const crossDir = cross.clone().multiplyScalar(-startSide);
        const goats: Goat[] = [];
        for (let i = 0; i < GOATS_PER_HERD; i++) {
          const mesh = makeGoat();
          mesh.position.copy(origin)
            .addScaledVector(fwd, (i - GOATS_PER_HERD / 2) * 1.3)
            .addScaledVector(cross, (rng() - 0.5) * 1.0);
          mesh.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          this.object.add(mesh);
          goats.push({ mesh, hit: false });
        }

        this.herds.push({
          goats,
          dir: crossDir,
          trigger: origin.clone(),
          active: false,
          done: false,
          dist: 0,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.done) continue;

      if (!herd.active) {
        if (herd.trigger.distanceTo(car.position) > TRIGGER_DIST) continue;
        herd.active = true;
      }

      const step = herd.dir.clone().multiplyScalar(GOAT_SPEED * dt);
      herd.dist += GOAT_SPEED * dt;

      for (const g of herd.goats) {
        g.mesh.position.add(step);
        if (!g.hit && g.mesh.position.distanceTo(car.position) < HIT_RADIUS) {
          g.hit = true;
          this._hits++;
          narrate('goat.hit');
          // Bounce the goat clear of the car's path
          g.mesh.position.addScaledVector(herd.dir, 3);
        }
      }

      if (herd.dist >= CROSSING_DIST) {
        herd.done = true;
        for (const g of herd.goats) g.mesh.visible = false;
      }
    }
  }

  get hits(): number { return this._hits; }
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
