import * as THREE from 'three';
import type { Car } from './car';
import { narrate } from './narrator';

// Speed threshold — below this (while moving forward) the frustration meter charges.
// Simulates being stuck in Kingston traffic until NPC traffic lands on main.
const TRAFFIC_SPEED_KMH = 10;
// Seconds of slow crawling to fill the meter from 0 → 1
const FILL_SECS = 22;
// Seconds for a full meter to drain back to zero when moving freely
const DECAY_SECS = 40;
// Seconds of active monster truck mode before auto-revert
export const TRUCK_DURATION = 10;
// Scale applied to car.object during transform (physics untouched — standing rule)
const TRUCK_SCALE = new THREE.Vector3(2.2, 2.4, 2.0);
// Range ahead of the monster truck in which crushable objects are flattened
const CRUSH_RADIUS = 20; // metres

// Registered by external systems (e.g. NPC traffic) as objects the truck can crush.
export interface Crushable {
  readonly object: THREE.Object3D;
  readonly position: THREE.Vector3;
}

interface SavedMesh {
  mesh: THREE.Mesh;
  color: THREE.Color;
}

// Monster Truck transformation: frustration builds while crawling in traffic.
// Press H (honk) when the meter is full to transform the Corolla into a cartoon
// monster truck. Crushable objects registered by external systems are flattened
// while active. Auto-reverts after TRUCK_DURATION seconds.
//
// Public API mirrors the pattern of Potholes / CowHerder:
//   constructor(car)
//   registerCrushables(list)
//   update(dt, honkJustPressed)
//   frustration: number   (0..1, for HUD)
//   active: boolean       (true while monster mode is on)
//   timeLeft: number      (seconds remaining in monster mode, for HUD)
export class MonsterTruck {
  frustration = 0; // 0..1
  active = false;
  timeLeft = 0;

  private savedMeshes: SavedMesh[] = [];
  private crushables: Crushable[] = [];
  private readyNarrated = false;

  constructor(private readonly car: Car) {}

  registerCrushables(list: Crushable[]): void {
    this.crushables = list;
  }

  update(dt: number, honkJustPressed: boolean): void {
    if (this.active) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this._crushNearby();
      if (this.timeLeft <= 0) this._revert();
      return;
    }

    // Charge meter when the car is moving but stuck at near-standstill pace
    const movingForward = this.car.speed > 0.4;
    const crawling = this.car.speedKmh < TRAFFIC_SPEED_KMH;
    if (movingForward && crawling) {
      this.frustration = Math.min(1, this.frustration + dt / FILL_SECS);
    } else {
      this.frustration = Math.max(0, this.frustration - dt / DECAY_SECS);
    }

    if (this.frustration >= 1 && !this.readyNarrated) {
      this.readyNarrated = true;
      narrate('monster.ready');
    }
    // Reset the ready flag once frustration dips (so narrator fires again next fill)
    if (this.frustration < 0.9) this.readyNarrated = false;

    if (honkJustPressed && this.frustration >= 1) {
      this._transform();
    }
  }

  // Percentage (0..100) for a unified HUD progress/countdown bar:
  // charging → fills orange; active → drains red (time remaining).
  get hudPct(): number {
    if (this.active) return (this.timeLeft / TRUCK_DURATION) * 100;
    return this.frustration * 100;
  }

  private _transform(): void {
    this.active = true;
    this.timeLeft = TRUCK_DURATION;
    this.frustration = 0;
    this.readyNarrated = false;

    // Snapshot mesh colours then paint monster-truck orange
    this.savedMeshes = [];
    this.car.object.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material as THREE.MeshLambertMaterial;
      this.savedMeshes.push({ mesh: obj, color: mat.color.clone() });
      mat.color.setHex(0xf26522);
      mat.needsUpdate = true;
    });

    // Scale the car up — visual-only, physics/handling untouched (standing rule)
    this.car.object.scale.copy(TRUCK_SCALE);

    narrate('monster.transform');
  }

  private _revert(): void {
    this.active = false;

    // Restore car to normal size and original colours
    this.car.object.scale.set(1, 1, 1);
    for (const { mesh, color } of this.savedMeshes) {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      mat.color.copy(color);
      mat.needsUpdate = true;
    }
    this.savedMeshes = [];

    narrate('monster.revert');
  }

  private _crushNearby(): void {
    if (this.crushables.length === 0) return;
    const fwd = new THREE.Vector3(
      -Math.sin(this.car.heading),
      0,
      -Math.cos(this.car.heading),
    );
    const carPos = this.car.position;

    for (const c of this.crushables) {
      const delta = c.position.clone().sub(carPos);
      // Only flatten objects within CRUSH_RADIUS and in front of the truck
      if (delta.length() > CRUSH_RADIUS) continue;
      if (delta.dot(fwd) < 0) continue;
      // Cartoon flatten: squash y, drop to ground
      if (c.object.scale.y > 0.1) {
        c.object.scale.y = 0.05;
        c.object.position.y = -0.15;
      }
    }
  }
}
