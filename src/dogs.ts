import * as THREE from 'three';
import { makeDog } from './animals';
import type { Car } from './car';
import { narrate } from './narrator';

// Dog chase mechanic (GAME_SPEC.md: dogs chase and bark through towns;
// Kingston dogs famously look both ways before crossing).
// Dogs are scattered at town sections. When a car enters NOTICE_RADIUS the
// dog gives chase; it sustains the chase for CHASE_DURATION ms then gives up.
// Narrator fires "dog.chase" once per session.

const NOTICE_RADIUS = 18;    // metres — dog notices car within this distance
const CHASE_SPEED = 7.2;     // m/s (~26 km/h — a motivated dog can really run)
const GIVE_UP_AFTER = 7000;  // ms — dog abandons the chase after this
const BARK_INTERVAL = 1800;  // ms between bark animations

// Approximate compressed-world spawn positions along urban stretches.
// These are route-fraction values (0–1) placed in town sections so they can
// be mapped via road.pointAtFraction() at construction time.
const SPAWN_FRACTIONS: { t: number; side: 1 | -1 }[] = [
  // Harbour View / east Kingston entry
  { t: 0.072, side: 1 }, { t: 0.078, side: -1 },
  // Windward Road / Rockfort
  { t: 0.098, side: 1 }, { t: 0.106, side: -1 }, { t: 0.114, side: 1 },
  // Mountain View Avenue
  { t: 0.142, side: -1 }, { t: 0.150, side: 1 },
  // Cross Roads area
  { t: 0.188, side: -1 }, { t: 0.196, side: 1 },
  // Half Way Tree
  { t: 0.218, side: 1 }, { t: 0.224, side: -1 }, { t: 0.230, side: 1 },
  // Spanish Town Road exit
  { t: 0.278, side: -1 }, { t: 0.284, side: 1 },
  // Linstead town
  { t: 0.520, side: 1 }, { t: 0.526, side: -1 }, { t: 0.532, side: 1 },
  // Moneague
  { t: 0.620, side: -1 }, { t: 0.626, side: 1 },
  // Ocho Rios
  { t: 0.882, side: 1 }, { t: 0.888, side: -1 }, { t: 0.894, side: 1 },
];

import type { RoadLike } from './road';

function pointAtFraction(road: RoadLike, t: number): THREE.Vector3 {
  const pts = road.points;
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i - 1].distanceTo(pts[i]); lens.push(l); total += l; }
  let target = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i]) return pts[i].clone().lerp(pts[i + 1], target / lens[i]);
    target -= lens[i];
  }
  return pts[pts.length - 1].clone();
}

function directionAtFraction(road: RoadLike, t: number): THREE.Vector3 {
  const pts = road.points;
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i - 1].distanceTo(pts[i]); lens.push(l); total += l; }
  let target = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i]) return pts[i + 1].clone().sub(pts[i]).normalize();
    target -= lens[i];
  }
  return pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
}

interface DogState {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  chasing: boolean;
  chaseTimer: ReturnType<typeof setTimeout> | undefined;
  barkPhase: number;
  barkTimer: ReturnType<typeof setTimeout> | undefined;
}

export class Dogs {
  readonly object: THREE.Group;
  private dogs: DogState[] = [];
  private narratedThisSession = false;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    for (const { t, side } of SPAWN_FRACTIONS) {
      const pos = pointAtFraction(road, t).clone();
      const dir = directionAtFraction(road, t);
      const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (3.8 + Math.random() * 1.5));
      pos.add(lateral);
      pos.y = 0;

      const mesh = makeDog();
      mesh.position.copy(pos);
      // Face inward toward road
      mesh.rotation.y = Math.atan2(dir.x, dir.z) + (side > 0 ? Math.PI : 0);
      this.object.add(mesh);

      this.dogs.push({ mesh, home: pos.clone(), chasing: false, chaseTimer: undefined, barkPhase: 0, barkTimer: undefined });
    }
  }

  update(car: Car, dt: number): void {
    const carPos = car.position;
    for (const dog of this.dogs) {
      const dist = dog.home.distanceTo(carPos);

      if (!dog.chasing && dist < NOTICE_RADIUS) {
        dog.chasing = true;
        this.startBark(dog);
        if (!this.narratedThisSession) {
          this.narratedThisSession = true;
          narrate('dog.chase');
        }
        clearTimeout(dog.chaseTimer);
        dog.chaseTimer = setTimeout(() => {
          dog.chasing = false;
          this.stopBark(dog);
          this.returnHome(dog);
        }, GIVE_UP_AFTER);
      }

      if (dog.chasing) {
        const towardCar = carPos.clone().sub(dog.mesh.position);
        towardCar.y = 0;
        const dist2d = towardCar.length();
        if (dist2d > 0.5) {
          towardCar.normalize().multiplyScalar(CHASE_SPEED * dt);
          dog.mesh.position.add(towardCar);
          dog.mesh.rotation.y = Math.atan2(towardCar.x, towardCar.z);
        }
        // Bark bob animation
        dog.mesh.position.y = Math.abs(Math.sin(dog.barkPhase)) * 0.08;
        dog.barkPhase += dt * 8;
      }
    }
  }

  private startBark(dog: DogState): void {
    clearInterval(dog.barkTimer as unknown as number);
    dog.barkTimer = setInterval(() => {
      dog.mesh.scale.set(1.08, 1.12, 1.08);
      setTimeout(() => dog.mesh.scale.set(1, 1, 1), 120);
    }, BARK_INTERVAL) as unknown as ReturnType<typeof setTimeout>;
  }

  private stopBark(dog: DogState): void {
    clearInterval(dog.barkTimer as unknown as number);
    dog.barkTimer = undefined;
    dog.mesh.scale.set(1, 1, 1);
  }

  private returnHome(dog: DogState): void {
    // Snap back to home without animation in V1
    dog.mesh.position.copy(dog.home);
    dog.mesh.position.y = 0;
  }
}
