import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 6;
const GOAT_SPEED = 1.6;       // m/s — unhurried goat amble
const HIT_RADIUS = 1.8;       // meters — close enough to count as a hit
const CROSS_DISTANCE = 14;    // meters each herd walks across before dispersing

// Goats appear on the country stretch: Linstead → Moneague (and a few in Faith's Pen area).
const GOAT_SEGMENTS = ['Linstead', 'Lydford', 'Moneague', "Faith's Pen", 'Mount Rosser'];

function isGoatSegment(name: string): boolean {
  return GOAT_SEGMENTS.some((t) => name.toLowerCase().includes(t.toLowerCase()));
}

interface GoatHerd {
  goats: THREE.Object3D[];
  positions: THREE.Vector3[];
  crossDir: THREE.Vector3;      // direction the herd walks (perpendicular to road)
  travelled: number;            // how far they've crossed
  done: boolean;
  penaltyFired: boolean;
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

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    const rng = mulberry32(2028);
    this.object = new THREE.Group();

    for (let i = 1; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !isGoatSegment(seg.name)) continue;

      // One herd every ~150–300 m of eligible road.
      if (rng() > 0.012) continue;

      const a = road.points[i - 1];
      const b = road.points[i];
      const dir = b.clone().sub(a).normalize();
      // Perpendicular — goats cross from right to left (they don't read road signs).
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);

      const t = rng();
      const origin = a.clone().lerp(b, t);
      // Start the herd off the right shoulder of the road.
      origin.addScaledVector(perp, -(6 + rng() * 4));
      origin.y = 0;

      const count = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
      const goatObjs: THREE.Object3D[] = [];
      const goatPositions: THREE.Vector3[] = [];

      for (let g = 0; g < count; g++) {
        const mesh = makeGoat();
        const offset = new THREE.Vector3(
          (rng() - 0.5) * 3,
          0,
          (rng() - 0.5) * 3,
        );
        const gPos = origin.clone().add(offset);
        mesh.position.copy(gPos);
        // Face the crossing direction.
        mesh.rotation.y = Math.atan2(perp.x, perp.z);
        this.object.add(mesh);
        goatObjs.push(mesh);
        goatPositions.push(gPos.clone());
      }

      this.herds.push({
        goats: goatObjs,
        positions: goatPositions,
        crossDir: perp.clone(),
        travelled: 0,
        done: false,
        penaltyFired: false,
      });
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.done) continue;

      // Only animate the herd when the car is within 200 m (performance).
      const refPos = herd.positions[0];
      if (car.position.distanceTo(refPos) > 200) continue;

      // Move each goat across the road.
      if (herd.travelled < CROSS_DISTANCE) {
        const step = GOAT_SPEED * dt;
        herd.travelled += step;
        for (let g = 0; g < herd.goats.length; g++) {
          herd.positions[g].addScaledVector(herd.crossDir, step);
          herd.goats[g].position.copy(herd.positions[g]);
        }
      } else {
        herd.done = true;
      }

      // Check for hit.
      if (!herd.penaltyFired) {
        for (const gPos of herd.positions) {
          if (gPos.distanceTo(car.position) < HIT_RADIUS) {
            herd.penaltyFired = true;
            narrate('goat.hit');
            // Signal the scoring system via a custom event — keeps modules decoupled.
            window.dispatchEvent(new CustomEvent('dj:goathit'));
            break;
          }
        }
      }
    }
  }
}
