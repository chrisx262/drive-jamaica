import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';
import { makeCow } from './animals';

const APPEAR_DIST = 130;  // m — herd becomes visible at this range
const WARN_DIST = 80;     // m — narrator warning fires once on approach
const HIT_DIST = 2.5;     // m — narrator scolding fires if car clips a cow
const PASS_DIST = 65;     // m ahead of origin — event considered cleared

// Point indices into the long Linstead-Moneague Road stretch (segment 458-628).
const HERD_INDICES = [490, 555] as const;

// [rightward offset, forward offset, rotation] — deterministic, no Math.random().
const COW_LAYOUT: [number, number, number][] = [
  [-1.8,  0.0, 0.0],
  [ 0.3,  1.3, 1.1],
  [ 2.0, -0.4, 2.5],
  [-0.5, -1.6, 3.7],
  [ 2.7,  0.9, 4.9],
];

function makeHerder(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5c3d1e, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.85, 0.28), bodyMat);
  body.position.y = 0.6;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.26, 0.26),
    new THREE.MeshLambertMaterial({ color: 0x8d5524, flatShading: true }),
  );
  head.position.y = 1.2;
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a0a00, flatShading: true }),
  );
  hat.position.y = 1.38;
  g.add(body, head, hat);
  return g;
}

interface HerdEvent {
  group: THREE.Group;
  origin: THREE.Vector3;
  forward: THREE.Vector3;
  cowPositions: THREE.Vector3[];
  warned: boolean;
  scolded: boolean;
  done: boolean;
}

// Cow herder event: a man with cows blocks the country road on the
// Linstead-Moneague stretch, forcing the player to swerve into the verge.
// Fires once per event per session; cows vanish once the car has passed.
export class CowHerder {
  readonly object: THREE.Group;
  private events: HerdEvent[] = [];

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    for (const idx of HERD_INDICES) {
      if (idx + 2 >= road.points.length) continue;
      const origin = road.points[idx].clone();
      const prev = road.points[Math.max(idx - 2, 0)];
      const next = road.points[Math.min(idx + 2, road.points.length - 1)];
      const forward = next.clone().sub(prev).normalize();
      // right-perpendicular in the horizontal plane
      const right = new THREE.Vector3(forward.z, 0, -forward.x);

      const group = new THREE.Group();
      group.position.copy(origin);
      group.visible = false;
      this.object.add(group);

      const cowPositions: THREE.Vector3[] = [];
      for (const [rf, ff, rot] of COW_LAYOUT) {
        const cow = makeCow();
        const lx = right.x * rf + forward.x * ff;
        const lz = right.z * rf + forward.z * ff;
        cow.position.set(lx, 0, lz);
        cow.rotation.y = rot;
        group.add(cow);
        // Store absolute world position for collision checks.
        cowPositions.push(new THREE.Vector3(origin.x + lx, 0, origin.z + lz));
      }

      // Herder stands on the left verge (driver's left — opposite to the swerve
      // direction), waving a stick. Placed 5.5 m right-of-road to stay in the
      // bushes.  Negative right = left verge.
      const herder = makeHerder();
      herder.position.set(
        right.x * -5.5 + forward.x * 1.0,
        0,
        right.z * -5.5 + forward.z * 1.0,
      );
      group.add(herder);

      this.events.push({
        group, origin, forward, cowPositions,
        warned: false, scolded: false, done: false,
      });
    }
  }

  update(car: Car): void {
    for (const ev of this.events) {
      if (ev.done) continue;

      const tocar = car.position.clone().sub(ev.origin);
      const dist = tocar.length();

      if (!ev.group.visible && dist < APPEAR_DIST) {
        ev.group.visible = true;
      }

      if (!ev.warned && dist < WARN_DIST) {
        ev.warned = true;
        narrate('cowherder.approach');
      }

      if (!ev.scolded && dist < WARN_DIST + 15) {
        for (const cp of ev.cowPositions) {
          if (car.position.distanceTo(cp) < HIT_DIST && Math.abs(car.speed) > 3) {
            ev.scolded = true;
            narrate('cowherder.hit');
            break;
          }
        }
      }

      // Clear once the car is PASS_DIST meters ahead of the herd origin.
      if (tocar.dot(ev.forward) > PASS_DIST) {
        ev.done = true;
        ev.group.visible = false;
      }
    }
  }
}
