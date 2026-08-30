import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross country roads (Linstead-Moneague stretch) unattended.
// Hitting one: brief impact + narrator scolding.
// Pattern matches src/potholes.ts: class with tiny public API, mulberry32 RNG.

const HIT_RADIUS = 1.6;             // m — collision distance
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const GOAT_CROSS_SPEED = 2.2;       // m/s walking across the road
const NEAR_MISS_RADIUS = 4.0;       // m — close enough to praise the driver

// Country road segments where goats cross (Linstead → Moneague stretch).
const COUNTRY_SEGMENT_PATTERNS = [
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
  'Sligoville Road',
  'Selassie Road',
  'Walks Road',
];

interface Goat {
  obj: THREE.Group;
  pos: THREE.Vector3;
  active: boolean; // crossing the road right now
}

interface Herd {
  goats: Goat[];
  crossDir: THREE.Vector3;    // unit vector across the road
  triggered: boolean;
  triggerPos: THREE.Vector3;  // point where car enters trigger zone (~60 m ahead)
  crossed: boolean;           // herd has completed crossing — remove from update
  hitNarrated: boolean;
  nearMissNarrated: boolean;
}

export class Goats {
  readonly objects: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike, scene: THREE.Scene) {
    this.objects = new THREE.Group();
    scene.add(this.objects);

    const rng = mulberry32(2028);
    const countryIndices: number[] = [];

    for (const seg of road.segments) {
      const isCountry = COUNTRY_SEGMENT_PATTERNS.some((p) => seg.name.includes(p));
      if (!isCountry) continue;
      for (let i = seg.from; i < seg.to - 1; i++) countryIndices.push(i);
    }

    // Place a herd roughly every 600-1200 m of country road.
    let spacing = 600 + rng() * 600;
    let accumulated = 0;
    for (let idx = 1; idx < countryIndices.length; idx++) {
      const a = road.points[countryIndices[idx - 1]];
      const b = road.points[countryIndices[idx]];
      accumulated += a.distanceTo(b);
      if (accumulated < spacing) continue;
      accumulated = 0;
      spacing = 600 + rng() * 600;

      const t = rng();
      const crossPoint = a.clone().lerp(b, t);
      const dir = b.clone().sub(a).normalize();
      const crossDir = new THREE.Vector3(-dir.z, 0, dir.x); // perpendicular to road

      const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
      const goats: Goat[] = [];

      for (let g = 0; g < herdSize; g++) {
        const obj = makeGoat();
        // Start herd spread on one side of the road (8-22 m off road)
        const spread = (rng() - 0.5) * 12; // stagger along road
        const startLateral = -(8 + rng() * 14); // start left of road
        const pos = crossPoint.clone()
          .addScaledVector(dir, spread)
          .addScaledVector(crossDir, startLateral);
        pos.y = 0;
        obj.position.copy(pos);
        obj.rotation.y = Math.atan2(crossDir.x, crossDir.z);
        this.objects.add(obj);
        goats.push({ obj, pos: pos.clone(), active: false });
      }

      this.herds.push({
        goats,
        crossDir,
        triggered: false,
        triggerPos: crossPoint.clone(),
        crossed: false,
        hitNarrated: false,
        nearMissNarrated: false,
      });
    }
  }

  // Returns score delta (negative on goat hit).
  update(car: Car, dt: number): number {
    let scoreDelta = 0;
    const carPos = car.position;

    for (const herd of this.herds) {
      if (herd.crossed) continue;

      // Trigger herd when car comes within 60 m of the crossing point
      if (!herd.triggered && herd.triggerPos.distanceTo(carPos) < 60) {
        herd.triggered = true;
        for (const g of herd.goats) g.active = true;
      }

      if (!herd.triggered) continue;

      let allCrossed = true;
      for (const g of herd.goats) {
        if (!g.active) continue;

        // Move goat across the road
        const step = herd.crossDir.clone().multiplyScalar(GOAT_CROSS_SPEED * dt);
        g.pos.add(step);
        g.obj.position.copy(g.pos);

        // Stop when 18 m past road center on the far side
        if (g.pos.distanceTo(herd.triggerPos) > 18 &&
            g.pos.clone().sub(herd.triggerPos).dot(herd.crossDir) > 0) {
          g.active = false;
          continue;
        }
        allCrossed = false;

        // Collision check
        const dist = g.pos.distanceTo(carPos);
        if (dist < HIT_RADIUS && !herd.hitNarrated) {
          herd.hitNarrated = true;
          narrate('goat.hit');
          scoreDelta -= 50;
          // Brief speed penalty — slow the car (impulse handled by caller applying score)
        } else if (dist < NEAR_MISS_RADIUS && !herd.nearMissNarrated && !herd.hitNarrated) {
          herd.nearMissNarrated = true;
          narrate('goat.near_miss');
        }
      }

      if (allCrossed) herd.crossed = true;
    }

    return scoreDelta;
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
