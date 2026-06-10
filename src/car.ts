import * as THREE from 'three';
import type { InputState } from './input';

// Arcade kinematic model: forgiving, fun-first. No sim physics (see GAME_SPEC).
const MAX_SPEED = 38; // m/s ~ 137 km/h
const MAX_REVERSE = -8;
const ACCEL = 14;
const BRAKE = 30;
const DRAG = 4;
const STEER_RATE = 2.2; // rad/s at full steer, scaled by speed factor

export class Car {
  readonly object: THREE.Group;
  heading = 0; // radians, 0 = -Z
  speed = 0; // m/s, signed

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

  update(dt: number, input: InputState): void {
    if (input.accelerate) this.speed += ACCEL * dt;
    else if (input.brake) this.speed -= BRAKE * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(DRAG * dt, Math.abs(this.speed));
    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REVERSE, MAX_SPEED);

    // Steering authority ramps up with speed, capped early so low-speed turns feel snappy.
    const steerScale = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1) * Math.sign(this.speed);
    if (input.left) this.heading += STEER_RATE * steerScale * dt;
    if (input.right) this.heading -= STEER_RATE * steerScale * dt;

    this.object.position.x -= Math.sin(this.heading) * this.speed * dt;
    this.object.position.z -= Math.cos(this.heading) * this.speed * dt;
    this.object.rotation.y = this.heading;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
}
