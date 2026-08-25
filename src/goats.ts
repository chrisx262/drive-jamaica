import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';

// Goat herds cross the Linstead–Moneague country road unattended.
// Owner rule (GAME_SPEC): hitting one = score penalty + narrator scolding.

const CROSS_SPEED = 1.8;         // m/s across road
const HERD_SPREAD = 5.5;         // lateral spacing between herd members (m)
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 7;
const HERD_GAP_MIN = 400;        // m between herds along the road
const HERD_GAP_MAX = 900;
const HIT_RADIUS = 1.2;          // m — collision radius
const TRIGGER_DIST = 80;         // m — herd becomes visible and starts crossing
const SCORE_PENALTY = 50;

// Segment names on the Linstead–Moneague country stretch where goats appear.
// Must match the name strings in data/route.json segments.
const GOAT_SEGMENTS = new Set([
  'Linstead - Moneague Road',
  'Pleasant Farm Road',
  'McGrath Road',
]);

interface Goat {
  obj: THREE.Group;
  crossing: boolean;
  crossDir: THREE.Vector3;
  hit: boolean;
}

interface Herd {
  goats: Goat[];
  active: boolean;
  triggered: boolean;
  roadPos: THREE.Vector3;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];
  private _scorePenalty = 0;

  get scorePenalty(): number { return this._scorePenalty; }

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    let nextAt = HERD_GAP_MIN;
    let travelled = 0;

    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const segLen = a.distanceTo(b);

      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (!seg || !GOAT_SEGMENTS.has(seg.name)) {
        travelled += segLen;
        continue;
      }

      while (travelled + segLen >= nextAt) {
        const t = (nextAt - travelled) / segLen;
        const roadPt = a.clone().lerp(b, t);
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const crossSide = rng() > 0.5 ? 1 : -1;
        const crossDir = perp.clone().multiplyScalar(-crossSide);

        const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        const herd: Herd = { goats: [], active: false, triggered: false, roadPos: roadPt.clone() };

        for (let g = 0; g < herdSize; g++) {
          const lateralOffset = (g - (herdSize - 1) / 2) * HERD_SPREAD;
          const startOffset = crossSide * (12 + rng() * 6);
          const alongOffset = (g * 1.2 + rng() * 0.8) * CROSS_SPEED;

          const gPos = roadPt.clone()
            .addScaledVector(perp, lateralOffset)
            .addScaledVector(dir, alongOffset)
            .addScaledVector(perp, startOffset);
          gPos.y = 0;

          const goatObj = makeGoat();
          goatObj.position.copy(gPos);
          goatObj.rotation.y = Math.atan2(-crossDir.x, -crossDir.z);
          goatObj.visible = false;

          this.object.add(goatObj);
          herd.goats.push({ obj: goatObj, crossing: false, crossDir, hit: false });
        }

        this.herds.push(herd);
        nextAt += HERD_GAP_MIN + rng() * (HERD_GAP_MAX - HERD_GAP_MIN);
      }

      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;

    for (const herd of this.herds) {
      const distToHerd = herd.roadPos.distanceTo(carPos);

      if (!herd.triggered && distToHerd < TRIGGER_DIST) {
        herd.triggered = true;
        herd.active = true;
        for (const g of herd.goats) g.obj.visible = true;
      }

      if (!herd.active) continue;

      let allDone = true;
      for (const g of herd.goats) {
        if (g.hit) continue;

        if (g.obj.position.distanceTo(carPos) < HIT_RADIUS) {
          g.hit = true;
          this._scorePenalty += SCORE_PENALTY;
          narrate('goat.hit');
          continue;
        }

        g.crossing = true;
        g.obj.position.addScaledVector(g.crossDir, CROSS_SPEED * dt);
        allDone = false;
      }

      if (allDone) herd.active = false;
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
