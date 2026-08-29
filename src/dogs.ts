import * as THREE from 'three';
import { makeDog } from './animals';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Town segments where dogs appear. Kingston dogs famously look both ways
// before crossing — they know the streets.
const TOWN_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Main Road',
  "King's Street",
]);

const DOGS_PER_SEGMENT = 3;
const CHASE_RADIUS    = 18;   // m — dog activates and chases
const BARK_RADIUS     = 6;    // m — close enough for narrator
const CHASE_SPEED     = 6.5;  // m/s
const CHASE_DURATION  = 8;    // s before dog gives up

interface DogState {
  mesh: THREE.Group;
  spawn: THREE.Vector3;
  chasing: boolean;
  timer: number;
}

export class Dogs {
  readonly object: THREE.Group;
  private states: DogState[] = [];
  private narratorFired = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(4242);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;
      const span = seg.to - seg.from;
      if (span < 2) continue;

      for (let d = 0; d < DOGS_PER_SEGMENT; d++) {
        const idx = seg.from + Math.floor(rng() * (span - 1));
        const a = road.points[idx];
        const b = road.points[Math.min(idx + 1, road.points.length - 1)];
        const fwd = b.clone().sub(a).normalize();
        const side = rng() > 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(side * (5 + rng() * 5));
        const pos = a.clone().lerp(b, rng()).add(lateral);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        this.object.add(mesh);
        this.states.push({ mesh, spawn: pos.clone(), chasing: false, timer: 0 });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const s of this.states) {
      const dist = s.mesh.position.distanceTo(car.position);

      if (!s.chasing && dist < CHASE_RADIUS) {
        s.chasing = true;
        s.timer = CHASE_DURATION;
      }

      if (!s.chasing) continue;

      s.timer -= dt;
      if (s.timer <= 0) {
        s.chasing = false;
        const toSpawn = s.spawn.clone().sub(s.mesh.position);
        if (toSpawn.length() > 0.5) {
          s.mesh.position.addScaledVector(toSpawn.normalize(), CHASE_SPEED * 0.4 * dt);
        }
        continue;
      }

      const tocar = car.position.clone().sub(s.mesh.position);
      const gap = tocar.length();
      if (gap > 0.5) {
        tocar.normalize();
        s.mesh.position.addScaledVector(tocar, Math.min(CHASE_SPEED * dt, gap));
        s.mesh.rotation.y = Math.atan2(-tocar.x, -tocar.z);
      }

      if (!this.narratorFired && dist < BARK_RADIUS) {
        this.narratorFired = true;
        narrate('dog.chase');
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
