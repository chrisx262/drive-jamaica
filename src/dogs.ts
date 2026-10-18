import * as THREE from 'three';
import { makeDog } from './animals';
import type { Car } from './car';
import type { RoadLike } from './road';
import { narrate } from './narrator';

// Dogs appear at intervals in town sections and chase the car when it passes.
// Kingston dogs famously look both ways before crossing (GAME_SPEC).
const NOTICE_RADIUS = 28; // m — dog wakes and starts chasing
const GIVE_UP_DIST = 55; // m from spawn — dog turns back when this far away
const CHASE_SPEED = 6.5; // m/s — fast enough to be alarming, slow enough to escape
const TOWN_SEGMENTS = new Set([
  'Sir Florizel Glaspole Boulevard',
  'Windward Road',
  'Mountain View Avenue',
  'Trafalgar Road',
  'Hope Road',
  'Hagley Park Road',
  'Spanish Town Road',
  'Barrett Street',
  'Wellington Street',
  'Church Road',
  'Main Road',
  'King\'s Street',
  'Moneague - Ocho Rios Road',
  'DaCosta Drive',
  'Northern Coastal Highway',
]);

interface DogInstance {
  mesh: THREE.Group;
  spawn: THREE.Vector3;
  state: 'idle' | 'chase' | 'returning';
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogInstance[] = [];
  private chaseNarratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    const rng = mulberry32(0xd06);
    const pts = road.points;
    const ROAD_WIDTH = 8;

    let travelled = 0;
    let nextDog = 60 + rng() * 80;

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segLen = a.distanceTo(b);
      const seg = road.segments.find((s) => i > s.from && i <= s.to);
      const inTown = seg ? TOWN_SEGMENTS.has(seg.name) : false;

      while (inTown && travelled + segLen >= nextDog) {
        const t = (nextDog - travelled) / segLen;
        const dir = b.clone().sub(a).normalize();
        // Offset to the side of the road (not in the middle of traffic)
        const side = rng() < 0.5 ? 1 : -1;
        const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side * (ROAD_WIDTH / 2 + 1 + rng() * 2));
        const pos = a.clone().lerp(b, t).add(lateral);
        pos.y = 0;

        const mesh = makeDog();
        mesh.position.copy(pos);
        mesh.rotation.y = rng() * Math.PI * 2;
        this.object.add(mesh);
        this.dogs.push({ mesh, spawn: pos.clone(), state: 'idle' });

        nextDog += 80 + rng() * 140;
      }
      travelled += segLen;
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const distToCar = dog.mesh.position.distanceTo(carPos);
      const distToSpawn = dog.mesh.position.distanceTo(dog.spawn);

      if (dog.state === 'idle' && distToCar < NOTICE_RADIUS) {
        dog.state = 'chase';
        if (!this.chaseNarratedThisSession) {
          this.chaseNarratedThisSession = true;
          narrate('dog.chase');
        }
      }

      if (dog.state === 'chase') {
        if (distToSpawn > GIVE_UP_DIST) {
          dog.state = 'returning';
        } else {
          const toward = carPos.clone().sub(dog.mesh.position);
          toward.y = 0;
          toward.normalize();
          dog.mesh.position.addScaledVector(toward, CHASE_SPEED * dt);
          dog.mesh.rotation.y = Math.atan2(-toward.x, -toward.z);
        }
      }

      if (dog.state === 'returning') {
        const toward = dog.spawn.clone().sub(dog.mesh.position);
        toward.y = 0;
        const dist = toward.length();
        if (dist < 0.3) {
          dog.mesh.position.copy(dog.spawn);
          dog.state = 'idle';
        } else {
          toward.normalize();
          dog.mesh.position.addScaledVector(toward, CHASE_SPEED * 0.5 * dt);
          dog.mesh.rotation.y = Math.atan2(-toward.x, -toward.z);
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
