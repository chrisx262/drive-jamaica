import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';
import { ROAD_WIDTH } from './road';

// Published so the (future) scoring module can deduct points without digging here.
export let goatHits = 0;

const ACTIVATE_RADIUS = 80;  // m — herd starts crossing when car gets this close
const HIT_RADIUS = 2.0;      // m — per-goat contact detection
const CROSS_SPEED = 1.6;     // m/s walking pace across the road
const HERD_SPACING = 1.8;    // m between goats staggered along the road tangent
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 6;

// Country road stretch: just past Linstead town through Moneague to Ocho Rios hills.
// Point indices reference route.json segments:
//   [403-628] Linstead-Moneague Road / Pleasant Farm Road / McGrath Road
//   [628-786] Moneague - Ocho Rios Road
const ZONE_FROM = 403;
const ZONE_TO = 786;

const HERD_MIN_GAP = 600;   // compressed-world metres between herds
const HERD_MAX_GAP = 1500;

interface GoatActor {
  mesh: THREE.Group;
  startPos: THREE.Vector3;
  crossDir: THREE.Vector3;
  crossDist: number;
  delay: number;    // stagger seconds before this goat starts walking
  elapsed: number;  // time accumulated since herd was activated
  done: boolean;
}

interface Herd {
  center: THREE.Vector3;
  goats: GoatActor[];
  activated: boolean;
  allDone: boolean;
}

export class Goats {
  readonly object: THREE.Group;
  private herds: Herd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    const zoneEnd = Math.min(ZONE_TO, road.points.length - 2);
    if (ZONE_FROM >= zoneEnd) return; // road too short (e.g. test track)

    const rng = mulberry32(3737);
    let zoneDist = 0;
    let nextHerdAt = HERD_MIN_GAP * 0.3 + rng() * HERD_MIN_GAP * 0.2;

    for (let i = ZONE_FROM; i < zoneEnd; i++) {
      zoneDist += road.points[i].distanceTo(road.points[i + 1]);
      if (zoneDist < nextHerdAt) continue;

      // Smooth tangent from neighbours to handle sharp corners gracefully
      const prev = road.points[Math.max(ZONE_FROM, i - 1)];
      const next = road.points[Math.min(road.points.length - 1, i + 1)];
      const tangent = next.clone().sub(prev).normalize();
      // Left perpendicular (positive = left of travel direction)
      const perp = new THREE.Vector3(-tangent.z, 0, tangent.x);

      const center = road.points[i].clone();
      // Goats start on one side of the road and cross to the other
      const side = rng() < 0.5 ? 1 : -1;
      const startOffset = perp.clone().multiplyScalar(side * (ROAD_WIDTH * 0.5 + 1.5));
      const crossDir = perp.clone().multiplyScalar(-side);
      const crossDist = ROAD_WIDTH + 3.0;

      const herdSize = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
      const goats: GoatActor[] = [];

      for (let g = 0; g < herdSize; g++) {
        // Spread goats along the road tangent with some jitter
        const along = (g - (herdSize - 1) / 2) * HERD_SPACING;
        const jitter = (rng() - 0.5) * 1.2;
        const startPos = center.clone()
          .add(startOffset)
          .addScaledVector(tangent, along + jitter);
        startPos.y = 0;

        const mesh = makeGoat();
        mesh.position.copy(startPos);
        // Face in the crossing direction (goat head is at local +Z)
        mesh.rotation.y = Math.atan2(crossDir.x, crossDir.z);
        this.object.add(mesh);

        goats.push({
          mesh,
          startPos: startPos.clone(),
          crossDir: crossDir.clone(),
          crossDist,
          delay: g * 0.5 + rng() * 0.5,  // stagger entry across the road
          elapsed: 0,
          done: false,
        });
      }

      this.herds.push({ center, goats, activated: false, allDone: false });
      nextHerdAt = zoneDist + HERD_MIN_GAP + rng() * (HERD_MAX_GAP - HERD_MIN_GAP);
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const herd of this.herds) {
      if (herd.allDone) continue;

      if (!herd.activated && herd.center.distanceTo(carPos) < ACTIVATE_RADIUS) {
        herd.activated = true;
      }
      if (!herd.activated) continue;

      let anyActive = false;
      for (const goat of herd.goats) {
        if (goat.done) continue;

        goat.elapsed += dt;
        const t = goat.elapsed - goat.delay;
        if (t <= 0) { anyActive = true; continue; } // waiting for stagger delay

        const dist = Math.min(t * CROSS_SPEED, goat.crossDist);
        const pos = goat.startPos.clone().addScaledVector(goat.crossDir, dist);
        // Subtle walking bob — just enough life without extra geometry
        pos.y = Math.abs(Math.sin(t * 3.2)) * 0.07;
        goat.mesh.position.copy(pos);

        if (dist >= goat.crossDist) {
          goat.done = true;
          goat.mesh.visible = false; // safely off the other side
          continue;
        }

        anyActive = true;

        // Collision: goat is on or near the carriageway while crossing
        if (pos.distanceTo(carPos) < HIT_RADIUS) {
          goatHits++;
          narrate('goat.hit');
          goat.done = true;
          goat.mesh.visible = false;
        }
      }

      if (!anyActive) herd.allDone = true;
    }
  }
}

// Local seeded RNG — same Mulberry32 implementation used across the project.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
