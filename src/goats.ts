import * as THREE from 'three';
import { makeGoat } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Goat herds cross the Linstead–Moneague stretch unattended.
// Hit one: score penalty + narrator scolding.
// Near-miss (within NEAR_MISS_RADIUS but not HIT_RADIUS): one-time quip.

const HIT_RADIUS = 1.6;
const NEAR_MISS_RADIUS = 4.0;
const GOAT_CROSS_SPEED = 1.4;  // m/s — leisurely road crossing
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const HERD_SPACING = 340;       // meters between herds (compressed world)

// Segment name substrings identifying the goat-country stretch.
const GOAT_SEGMENTS = ['Linstead - Moneague', 'Pleasant Farm', 'McGrath'];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GoatAgent {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  crossDir: THREE.Vector3;
  crossDist: number;
  crossed: number;
  hit: boolean;
  nearMissed: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatAgent[][] = [];
  goatsHit = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0x60a7);
    const pts = road.points;

    let distAlongSeg = 0;
    let nextHerdAt = HERD_SPACING * (0.4 + rng() * 0.6);

    for (let i = 1; i < pts.length; i++) {
      const onGoatStretch = road.segments.some(
        (s) => i >= s.from && i < s.to && GOAT_SEGMENTS.some((p) => s.name.includes(p))
      );
      if (!onGoatStretch) {
        distAlongSeg = 0;
        nextHerdAt = HERD_SPACING * (0.4 + rng() * 0.6);
        continue;
      }

      const a = pts[i - 1];
      const b = pts[i];
      const segLen = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);

      while (distAlongSeg + segLen >= nextHerdAt) {
        const t = (nextHerdAt - distAlongSeg) / segLen;
        const spawnPos = a.clone().lerp(b, t);
        const crossDir = perp.clone().multiplyScalar(rng() < 0.5 ? 1 : -1);
        const crossDist = 14 + rng() * 8;

        const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        const herd: GoatAgent[] = [];

        for (let g = 0; g < herdSize; g++) {
          const offset = crossDir.clone().multiplyScalar(-crossDist * 0.5 - rng() * 4);
          offset.add(dir.clone().multiplyScalar((rng() - 0.5) * 6));
          const goatPos = spawnPos.clone().add(offset);
          goatPos.y = 0;

          const mesh = makeGoat();
          mesh.position.copy(goatPos);
          mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z) + (rng() - 0.5) * 0.4;
          this.object.add(mesh);

          herd.push({
            mesh,
            pos: goatPos.clone(),
            crossDir: crossDir.clone(),
            crossDist,
            crossed: 0,
            hit: false,
            nearMissed: false,
          });
        }

        this.herds.push(herd);
        nextHerdAt += HERD_SPACING * (0.6 + rng() * 0.8);
      }

      distAlongSeg += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      for (const goat of herd) {
        if (goat.hit) continue;

        if (goat.crossed < goat.crossDist) {
          const step = GOAT_CROSS_SPEED * dt;
          goat.pos.addScaledVector(goat.crossDir, step);
          goat.crossed += step;
          goat.mesh.position.copy(goat.pos);
        }

        const dist = goat.pos.distanceTo(carPos);

        if (dist < HIT_RADIUS) {
          goat.hit = true;
          goat.mesh.visible = false;
          this.goatsHit++;
          narrate('goat.hit');
          continue;
        }

        if (!goat.nearMissed && dist < NEAR_MISS_RADIUS) {
          goat.nearMissed = true;
          narrate('goat.nearMiss');
        }
      }
    }
  }
}
