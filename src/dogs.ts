import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeDog } from './animals';
import { narrate } from './narrator';

const TRIGGER_RADIUS = 28;    // car distance that starts the chase (m)
const CHASE_SPEED = 7;        // m/s dog sprint
const RESET_RADIUS = 80;      // dog gives up beyond this distance (m)

// Urban / town segments where dogs are common (see GAME_SPEC: "dogs through towns").
const TOWN_SEGMENTS = new Set([
  'Windward Road',
  'Mountain View Avenue',
  'Hagley Park Road',
  'Main Road',         // Linstead town
  'King\'s Street',   // Linstead town
  'Church Road',      // Linstead
  'Spanish Town Road',
]);

interface DogEntry {
  mesh: THREE.Object3D;
  spawn: THREE.Vector3;
  pos: THREE.Vector3;
  triggered: boolean;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogEntry[] = [];
  private chaseNarrated = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(2027);

    for (const seg of road.segments) {
      if (!TOWN_SEGMENTS.has(seg.name)) continue;
      const len = seg.to - seg.from;
      // 2–4 dogs per town segment, spread evenly
      const count = 2 + Math.floor(rng() * 3);
      for (let d = 0; d < count; d++) {
        const idx = seg.from + Math.floor(len / (count + 1)) * (d + 1);
        if (idx + 1 >= road.points.length) continue;

        const a = road.points[idx];
        const b = road.points[Math.min(idx + 1, road.points.length - 1)];
        const dir = b.clone().sub(a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        const side = rng() < 0.5 ? 1 : -1;
        const offset = 6 + rng() * 5; // 6–11 m from road centre
        const spawnPos = a.clone().addScaledVector(perp, side * offset);
        spawnPos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(spawnPos);
        this.object.add(mesh);

        this.dogs.push({
          mesh,
          spawn: spawnPos.clone(),
          pos: spawnPos.clone(),
          triggered: false,
        });
      }
    }
  }

  update(car: Car, dt: number): void {
    for (const d of this.dogs) {
      const dist = d.pos.distanceTo(car.position);

      if (!d.triggered) {
        if (dist < TRIGGER_RADIUS) {
          d.triggered = true;
          if (!this.chaseNarrated) {
            narrate('dog.chase');
            this.chaseNarrated = true;
          }
        }
        continue;
      }

      if (dist > RESET_RADIUS) {
        d.triggered = false;
        d.pos.copy(d.spawn);
        d.mesh.position.copy(d.spawn);
        continue;
      }

      // Chase: move toward car
      const tocar = car.position.clone().sub(d.pos);
      tocar.y = 0;
      if (tocar.length() > 0.1) {
        tocar.normalize();
        d.pos.addScaledVector(tocar, CHASE_SPEED * dt);
        d.pos.y = 0;
        d.mesh.position.copy(d.pos);
        d.mesh.rotation.y = Math.atan2(-tocar.x, -tocar.z);
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
