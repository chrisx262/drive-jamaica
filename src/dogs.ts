import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

// Town segments where street dogs appear.
// "City dogs in Kingston famously look both ways before crossing" (GAME_SPEC).
const TOWN_SEGS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Church Road',
  'Main Road',
  "King's Street",
  'Moneague - Golden Grove Road',
]);

const CHASE_START = 18; // world units — dog wakes and chases when car is this close
const GIVE_UP = 60;     // world units — dog abandons chase beyond this
const CHASE_SPEED = 7;  // world units/sec

type DogState = 'idle' | 'chasing' | 'done';

interface DogEntry {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  state: DogState;
}

// Dog-chase module. Public API matches the potholes.ts pattern.
export class Dogs {
  readonly object: THREE.Group;
  private entries: DogEntry[] = [];
  private firstChaseDone = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(20260002);

    for (const seg of road.segments) {
      if (!TOWN_SEGS.has(seg.name)) continue;
      const span = seg.to - seg.from;
      if (span < 4) continue;
      // Roughly one dog per 20 road points in a town stretch, min 1 per qualifying segment.
      const count = Math.max(1, Math.floor(span / 20));
      for (let i = 0; i < count; i++) {
        const idx = seg.from + Math.floor(((i + 0.5) / count) * span);
        const p = road.points[idx];
        const next = road.points[Math.min(idx + 1, road.points.length - 1)];
        const dir = next.clone().sub(p).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const side = rng() < 0.5 ? 1 : -1;
        const lateral = 5 + rng() * 7; // 5–12 units from road edge
        const spawn = p.clone().addScaledVector(perp, side * lateral);

        const mesh = makeDog();
        mesh.position.copy(spawn);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);
        this.entries.push({ mesh, pos: spawn.clone(), state: 'idle' });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const e of this.entries) {
      if (e.state === 'done') continue;
      const d = e.pos.distanceTo(car.position);

      if (e.state === 'idle' && d < CHASE_START) {
        e.state = 'chasing';
        if (!this.firstChaseDone) {
          this.firstChaseDone = true;
          narrate('dog.chase');
        }
      }

      if (e.state === 'chasing') {
        if (d > GIVE_UP) {
          e.state = 'done';
          e.mesh.visible = false;
          continue;
        }
        const step = Math.min(CHASE_SPEED * dt, d);
        const dir = car.position.clone().sub(e.pos).normalize();
        e.pos.addScaledVector(dir, step);
        e.mesh.position.copy(e.pos);
        e.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
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
