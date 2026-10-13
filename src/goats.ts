import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herds appear on the country-road stretches from Linstead through Moneague.
// They cross the road unattended and can be hit — doing so has consequences.
const HERD_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Sligoville Road',
  'Selassie Road',
  'Moneague - Golden Grove Road',
  'Moneague - Ocho Rios Road',
]);

const HERD_SPACING   = 600;   // meters between herds
const HERD_SIZE_MIN  = 2;
const HERD_SIZE_MAX  = 5;
const GOAT_SPEED     = 0.9;   // m/s across road
const HIT_RADIUS     = 2.2;
const ROAD_HALF_W    = 4;     // half of ROAD_WIDTH=8

interface GoatInstance {
  mesh: THREE.Group;
  dir: THREE.Vector3;   // crossing direction (perpendicular to road)
  done: boolean;
  hit: boolean;
}

interface Herd {
  goats: GoatInstance[];
  active: boolean;
  startZ: number;  // the road point's z-world used for activate-on-approach
  activationPos: THREE.Vector3;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  private scoreCallback: ((delta: number) => void) | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(5531);

    let accumulated = 0;
    let nextHerd = HERD_SPACING * (0.4 + rng() * 0.6);

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      const isCountry = seg ? HERD_SEGMENTS.has(seg.name) : false;

      while (isCountry && accumulated + segLen >= nextHerd) {
        const t = (nextHerd - accumulated) / segLen;
        const spawnAnchor = a.clone().lerp(b, t);
        const dir = b.clone().sub(a).normalize();
        // Crossing direction: perpendicular to road (from left verge to right)
        const crossing = new THREE.Vector3(dir.z, 0, -dir.x);

        const count = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        const herdGoats: GoatInstance[] = [];

        for (let g = 0; g < count; g++) {
          const mesh = makeGoat();
          // Stagger across the left verge, offset along road slightly
          const alongOffset = (rng() - 0.5) * 6;
          const startLateral = ROAD_HALF_W + 1 + rng() * 3; // just off left edge
          const pos = spawnAnchor.clone()
            .addScaledVector(dir, alongOffset)
            .addScaledVector(crossing, startLateral);
          pos.y = 0;
          mesh.position.copy(pos);
          mesh.rotation.y = Math.atan2(-crossing.x, -crossing.z);
          // Start invisible — activated when car approaches
          mesh.visible = false;
          this.object.add(mesh);
          herdGoats.push({ mesh, dir: crossing.clone(), done: false, hit: false });
        }

        this.herds.push({
          goats: herdGoats,
          active: false,
          startZ: spawnAnchor.z,
          activationPos: spawnAnchor.clone(),
        });

        nextHerd += HERD_SPACING * (0.6 + rng() * 0.8);
      }

      accumulated += segLen;
    }
  }

  onScore(cb: (delta: number) => void): void {
    this.scoreCallback = cb;
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      // Activate herd when car is within 80m of anchor
      if (!herd.active && herd.activationPos.distanceTo(carPos) < 80) {
        herd.active = true;
        for (const g of herd.goats) g.mesh.visible = true;
      }

      if (!herd.active) continue;

      for (const goat of herd.goats) {
        if (goat.done) continue;

        // Move goat across the road
        goat.mesh.position.addScaledVector(goat.dir, -dt * GOAT_SPEED);
        goat.mesh.position.y = 0;

        // Goat has crossed — hide when it reaches the right verge + a little beyond
        const lateral = goat.mesh.position.distanceTo(herd.activationPos);
        if (lateral > ROAD_HALF_W * 2 + 4) {
          goat.done = true;
          goat.mesh.visible = false;
          continue;
        }

        // Collision with car
        if (!goat.hit && goat.mesh.position.distanceTo(carPos) < HIT_RADIUS) {
          goat.hit = true;
          goat.done = true;
          goat.mesh.visible = false;
          narrate('goat.hit');
          this.scoreCallback?.(-50);
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
