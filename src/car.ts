import * as THREE from 'three';
import type { InputState } from './input';

// Arcade kinematic model: forgiving, fun-first. No sim physics (see GAME_SPEC).
const MAX_SPEED = 31; // m/s ~ 112 km/h (compressed-world curves punish more)
const MAX_REVERSE = -8;
const ACCEL = 14;
const BRAKE = 30;
const DRAG = 4;
const STEER_RATE = 1.6; // rad/s at full steer, scaled by speed factor
const STEER_ATTACK = 5; // how fast the wheel turns in (1/s)
const STEER_RELEASE = 8; // how fast it re-centers (1/s)

export class Car {
  readonly object: THREE.Group;
  heading = 0; // radians, 0 = -Z
  speed = 0; // m/s, signed
  tyreBurst = false;
  locked = false;
  tyresBurstCount = 0;
  topSpeedKmh = 0;
  private steer = 0; // smoothed steering position, -1 (right) .. 1 (left)

  constructor() {
    this.object = new THREE.Group();

    // Placeholder Corolla: box body + cabin until GLB assets land.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.55, 4.2),
      new THREE.MeshLambertMaterial({ color: 0xd4d4d4 })
    );
    body.position.y = 0.5;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 2.0),
      new THREE.MeshLambertMaterial({ color: 0x444c55 })
    );
    cabin.position.set(0, 1.0, 0.1);
    this.object.add(body, cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.32, z);
      this.object.add(w);
    }
  }

  lock(): void {
    this.locked = true;
    this.speed = 0;
  }

  update(dt: number, input: InputState): void {
    if (this.locked) return;
    if (input.accelerate) this.speed += ACCEL * dt;
    else if (input.brake) this.speed -= BRAKE * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(DRAG * dt, Math.abs(this.speed));
    const maxFwd = this.tyreBurst ? MAX_SPEED * 0.55 : MAX_SPEED;
    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REVERSE, maxFwd);

    // Smoothed steering: keyboard taps ramp the wheel in and out instead of
    // snapping to full lock — binary steering felt hard to control (owner
    // feedback, twice). Authority still ramps with speed then attenuates.
    const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const rate = target !== 0 && Math.sign(target) !== Math.sign(this.steer || target) ? STEER_RELEASE
      : target !== 0 ? STEER_ATTACK : STEER_RELEASE;
    this.steer = THREE.MathUtils.clamp(this.steer + (target - this.steer) * Math.min(rate * dt, 1), -1, 1);

    const steerScale = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1) * Math.sign(this.speed);
    const attenuation = 1 / (1 + Math.abs(this.speed) / 18);
    this.heading += STEER_RATE * this.steer * steerScale * attenuation * dt;
    // Burst tyre pulls and wobbles
    if (this.tyreBurst) this.heading += Math.sin(performance.now() / 90) * 0.25 * Math.abs(steerScale) * dt;

    this.object.position.x -= Math.sin(this.heading) * this.speed * dt;
    this.object.position.z -= Math.cos(this.heading) * this.speed * dt;
    this.object.rotation.y = this.heading;
    this.topSpeedKmh = Math.max(this.topSpeedKmh, this.speedKmh);
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get steerPos(): number {
    return this.steer;
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  burstTyre(): void {
    this.tyreBurst = true;
    this.tyresBurstCount++;
  }

  repairTyre(): void {
    this.tyreBurst = false;
  }
}
