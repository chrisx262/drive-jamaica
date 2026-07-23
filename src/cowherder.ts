import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { makeCow } from './animals';
import { narrate } from './narrator';

// GAME_SPEC: "man with cows blocking a country road — player must swerve into the bushes and back"
// Placed once on the Linstead–Moneague Road stretch (segment from=458 to=628).
// Fires approach + optional hit + clear narrator lines; one-shot per session.

const EVENT_POINT = 525;     // route point index — roughly mid Linstead–Moneague
const APPROACH_RADIUS = 85;  // meters — narrator line fires here
const HIT_RADIUS = 3.8;      // meters per cow — collision bump trigger
const CLEAR_AHEAD = 48;      // meters past the event center before herd clears

export class CowHerder {
  readonly object: THREE.Group;
  private readonly eventPos: THREE.Vector3;
  private readonly fwdDir: THREE.Vector3;
  private readonly rightDir: THREE.Vector3;
  private readonly sceneChildren: THREE.Object3D[] = [];
  private readonly sceneInitialPos: THREE.Vector3[] = [];
  private readonly cowColliders: THREE.Vector3[] = [];
  private approached = false;
  private hitFired = false;
  private cleared = false;
  private clearProgress = 0;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    const pts = road.points;
    const pi = Math.min(EVENT_POINT, pts.length - 2);
    this.eventPos = pts[pi].clone();

    const pPrev = pts[Math.max(0, pi - 1)];
    const pNext = pts[Math.min(pts.length - 1, pi + 1)];
    this.fwdDir = pNext.clone().sub(pPrev).normalize();
    this.rightDir = new THREE.Vector3(-this.fwdDir.z, 0, this.fwdDir.x);

    // Three cows blocking the road — staggered so the player can thread between or swerve wide
    const cowDefs = [
      { along: -4, lateral: -2.8 },
      { along: 0,  lateral:  1.2 },
      { along: 4,  lateral: -0.8 },
    ];
    const cowYaw = Math.atan2(-this.fwdDir.x, -this.fwdDir.z);
    for (const { along, lateral } of cowDefs) {
      const cow = makeCow();
      const pos = this.eventPos.clone()
        .addScaledVector(this.fwdDir, along)
        .addScaledVector(this.rightDir, lateral);
      cow.position.copy(pos);
      cow.rotation.y = cowYaw + 0.3; // slightly sideways — grazing pose
      this.cowColliders.push(pos.clone());
      this.sceneChildren.push(cow);
      this.sceneInitialPos.push(pos.clone());
      this.object.add(cow);
    }

    // Herder — simple voxel-style humanoid with a stick
    const herder = this.makeHerder();
    const herderPos = this.eventPos.clone()
      .addScaledVector(this.fwdDir, 2)
      .addScaledVector(this.rightDir, 3.2);
    herder.position.copy(herderPos);
    herder.rotation.y = cowYaw - 0.15;
    this.sceneChildren.push(herder);
    this.sceneInitialPos.push(herderPos.clone());
    this.object.add(herder);
  }

  update(car: Car): void {
    if (this.cleared && this.clearProgress >= 1) return;

    const dist = this.eventPos.distanceTo(car.position);

    // Approach — narrator warning fires once
    if (!this.approached && dist < APPROACH_RADIUS) {
      this.approached = true;
      narrate('cowherder.approach');
    }

    // Collision with any cow — bump the car and scold (once per event)
    if (!this.cleared && !this.hitFired) {
      for (const colliderPos of this.cowColliders) {
        if (car.position.distanceTo(colliderPos) < HIT_RADIUS) {
          this.hitFired = true;
          car.speed *= 0.35; // jarring bump — not a tyre burst
          narrate('cowherder.hit');
          break;
        }
      }
    }

    // Clear when car has moved far enough past the event
    const aheadDist = car.position.clone().sub(this.eventPos).dot(this.fwdDir);
    if (this.approached && !this.cleared && aheadDist > CLEAR_AHEAD) {
      this.cleared = true;
      narrate('cowherder.clear');
    }

    // Animate herd off the road once cleared — cows and herder slide rightward
    if (this.cleared && this.clearProgress < 1) {
      this.clearProgress = Math.min(this.clearProgress + 0.005, 1);
      for (let i = 0; i < this.sceneChildren.length; i++) {
        this.sceneChildren[i].position
          .copy(this.sceneInitialPos[i])
          .addScaledVector(this.rightDir, this.clearProgress * 18);
      }
    }
  }

  private makeHerder(): THREE.Group {
    const g = new THREE.Group();

    // Torso — green work shirt, common rural attire
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.6, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x2d4a1e, flatShading: true }),
    );
    torso.position.y = 1.1;

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x8b6450, flatShading: true }),
    );
    head.position.y = 1.58;

    // Straw hat brim
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.06, 8),
      new THREE.MeshLambertMaterial({ color: 0xc8a84b, flatShading: true }),
    );
    hat.position.y = 1.76;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.16, 0.55, 0.16);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e, flatShading: true });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.55, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.55, 0);

    // Herding stick
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b4226, flatShading: true }),
    );
    stick.position.set(0.32, 1.1, 0);
    stick.rotation.z = 0.22;

    g.add(torso, head, hat, legL, legR, stick);
    return g;
  }
}
