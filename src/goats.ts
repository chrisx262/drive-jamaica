import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeGoat } from './animals';
import { narrate } from './narrator';
import { mulberry32 } from './rng';
import { addScoringEvent } from './scoring';

const HIT_RADIUS = 1.8;       // metres — close enough to count as a collision
const GOAT_SPEED = 2.2;       // m/s — ambling across the road
const HERD_SIZE_MIN = 3;
const HERD_SIZE_MAX = 6;
const ROAD_HALF_WIDTH = 5;    // how far goats travel to clear the road

// Goats roam the rural country road between Linstead and Moneague.
const GOAT_ZONE = { from: 391, to: 628 };

const MIN_GAP = 300;   // metres between herds — sparse and surprising
const MAX_GAP = 700;

class GoatHerd {
  readonly group: THREE.Group;
  private goats: THREE.Object3D[] = [];
  private direction: THREE.Vector3;
  private active = true;
  private collisionFired = false;
  private nearMissFired = false;
  readonly startPos: THREE.Vector3;

  constructor(pos: THREE.Vector3, roadDir: THREE.Vector3, count: number) {
    this.startPos = pos.clone();
    this.group = new THREE.Group();
    // Goats cross perpendicular to the road direction
    this.direction = new THREE.Vector3(-roadDir.z, 0, roadDir.x).normalize();

    for (let i = 0; i < count; i++) {
      const g = makeGoat();
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * 4,
      );
      g.position.copy(pos).add(offset).setY(0);
      // Start goats on the right verge — they cross to the left
      g.position.addScaledVector(this.direction, -ROAD_HALF_WIDTH - 2);
      this.goats.push(g);
      this.group.add(g);
    }
  }

  update(dt: number, car: Car): void {
    if (!this.active) return;

    for (const g of this.goats) {
      g.position.addScaledVector(this.direction, GOAT_SPEED * dt);
      g.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    }

    if (!this.collisionFired) {
      let hit = false;
      let closestDist = Infinity;
      for (const g of this.goats) {
        const d = g.position.distanceTo(car.position);
        if (d < closestDist) closestDist = d;
        if (d < HIT_RADIUS) hit = true;
      }

      if (hit) {
        this.collisionFired = true;
        narrate('goat.hit');
        addScoringEvent('goat.hit');
      } else if (!this.nearMissFired && closestDist < HIT_RADIUS * 3.5) {
        this.nearMissFired = true;
        narrate('goat.spared');
        addScoringEvent('goat.spared');
      }
    }

    // Herd clears the road once it has crossed far enough
    const lead = this.goats[0];
    if (lead && lead.position.distanceTo(this.startPos) > ROAD_HALF_WIDTH * 2 + 6) {
      this.active = false;
      this.group.visible = false;
    }
  }

  isActive(): boolean { return this.active; }
}

export class Goats {
  readonly object: THREE.Group;
  private herds: GoatHerd[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2028);

    const cumDist: number[] = [0];
    for (let i = 1; i < road.points.length; i++) {
      cumDist.push(cumDist[i - 1] + road.points[i - 1].distanceTo(road.points[i]));
    }

    const zoneStart = cumDist[GOAT_ZONE.from];
    const zoneEnd   = cumDist[Math.min(GOAT_ZONE.to, road.points.length - 1)];
    let nextAt = zoneStart + MIN_GAP * 0.6;

    for (let i = GOAT_ZONE.from + 1; i < GOAT_ZONE.to && i < road.points.length; i++) {
      while (cumDist[i] >= nextAt && nextAt < zoneEnd) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const segDist = cumDist[i] - cumDist[i - 1];
        const t = segDist > 0 ? (nextAt - cumDist[i - 1]) / segDist : 0;
        const pos = a.clone().lerp(b, t);
        pos.y = 0;
        const roadDir = b.clone().sub(a).normalize();
        const count = HERD_SIZE_MIN + Math.floor(rng() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1));
        const herd = new GoatHerd(pos, roadDir, count);
        this.herds.push(herd);
        this.object.add(herd.group);

        nextAt += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
      }
    }
  }

  update(car: Car, dt: number): void {
    // Only update herds within range (performance guard)
    for (const herd of this.herds) {
      if (!herd.isActive()) continue;
      if (herd.startPos.distanceTo(car.position) > 400) continue;
      herd.update(dt, car);
    }
  }
}
