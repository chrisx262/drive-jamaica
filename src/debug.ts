import * as THREE from 'three';
import type { Car } from './car';
import type { Potholes } from './potholes';
import { HIT_RADIUS } from './potholes';
import { ROAD_WIDTH } from './road';

// Debug overlay — activated by ?debug or ?testtrack URL params; toggled with F3.
// Works on both the main route and the test track.
// Zero effect when never instantiated (not a sidecar that always runs).
export class Debug {
  private readonly scene: THREE.Scene;
  private readonly car: Car;
  private enabled = true;

  private readonly fpsEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private readonly velArrow: THREE.ArrowHelper;
  private readonly steerArrow: THREE.ArrowHelper;
  private readonly hitboxGroup: THREE.Group;
  private readonly edgeGroup: THREE.Group;

  private frameCount = 0;
  private elapsed = 0;
  private fps = 0;
  private readonly testTrackMode: boolean;

  constructor(
    scene: THREE.Scene,
    car: Car,
    roadPoints: THREE.Vector3[],
    potholes: Potholes,
    isTestTrack = false,
  ) {
    this.scene = scene;
    this.car = car;
    this.testTrackMode = isTestTrack;

    // FPS + telemetry panel (top-right corner)
    this.fpsEl = makeEl({ top: '8px', right: '8px', fontSize: '13px', fontFamily: 'monospace' });
    this.fpsEl.textContent = '-- fps';

    this.infoEl = makeEl({
      top: '32px', right: '8px', fontSize: '12px',
      fontFamily: 'monospace', whiteSpace: 'pre',
    });

    // Velocity arrow (yellow): direction of travel, length ∝ speed
    this.velArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 2, 0xffff00,
    );
    scene.add(this.velArrow);

    // Steering arrow (cyan): perpendicular to heading, length ∝ |steer|
    this.steerArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x00ffff,
    );
    this.steerArrow.visible = false;
    scene.add(this.steerArrow);

    // Pothole hitbox rings (red wireframe circles at hit radius)
    this.hitboxGroup = new THREE.Group();
    const ringGeo = buildCircleGeo(HIT_RADIUS, 20);
    const ringMat = new THREE.LineBasicMaterial({ color: 0xff2222 });
    for (const p of potholes.positions) {
      const ring = new THREE.LineLoop(ringGeo, ringMat);
      ring.position.copy(p).setY(0.05);
      this.hitboxGroup.add(ring);
    }
    scene.add(this.hitboxGroup);

    // Road ribbon edge lines (magenta): mirror the ribbon geometry in road.ts
    this.edgeGroup = new THREE.Group();
    this.edgeGroup.add(
      buildEdgeLine(roadPoints, +1, 0xff22ff), // perp direction (matches road.ts "left" variable)
      buildEdgeLine(roadPoints, -1, 0xff88ff), // opposite edge
    );
    scene.add(this.edgeGroup);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.toggle(); }
    });

    this.apply();
  }

  update(dt: number): void {
    this.frameCount++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fps = Math.round(this.frameCount / this.elapsed);
      this.frameCount = 0;
      this.elapsed = 0;
      this.fpsEl.textContent = `${this.fps} fps`;
    }

    if (!this.enabled) return;

    const speed = this.car.speed;
    const heading = this.car.heading;
    const steer = this.car.steerPos;

    this.infoEl.textContent =
      (this.testTrackMode ? '[TEST TRACK]\n' : '') +
      `spd  ${(Math.abs(speed) * 3.6).toFixed(0)} km/h\n` +
      `hdg  ${((heading * 180) / Math.PI).toFixed(1)}°\n` +
      `str  ${steer.toFixed(2)}`;

    // Velocity arrow: heading direction, length = max(0.5, |speed|/5)
    const fwd = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    const velLen = Math.max(0.5, Math.abs(speed) / 5);
    this.velArrow.position.copy(this.car.position).setY(1.5);
    this.velArrow.setDirection(speed >= 0 ? fwd : fwd.clone().negate());
    this.velArrow.setLength(velLen, Math.min(velLen * 0.4, 1.2), Math.min(velLen * 0.25, 0.6));

    // Steering arrow: car's left direction, length = |steer| * 4; hidden when near-zero
    const absSteer = Math.abs(steer);
    if (absSteer > 0.02) {
      // Car's left = 90° CCW rotation of forward direction around Y-up
      const leftDir = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading));
      const steerDir = steer >= 0 ? leftDir : leftDir.clone().negate();
      const steerLen = absSteer * 4;
      this.steerArrow.position.copy(this.car.position).setY(1.5);
      this.steerArrow.setDirection(steerDir);
      this.steerArrow.setLength(steerLen, Math.min(steerLen * 0.45, 1), 0.25);
      this.steerArrow.visible = true;
    } else {
      this.steerArrow.visible = false;
    }
  }

  private toggle(): void {
    this.enabled = !this.enabled;
    this.apply();
  }

  private apply(): void {
    const v = this.enabled;
    this.fpsEl.style.opacity = v ? '1' : '0.3';
    this.infoEl.style.opacity = v ? '1' : '0.3';
    this.velArrow.visible = v;
    this.hitboxGroup.visible = v;
    this.edgeGroup.visible = v;
    // steerArrow visibility managed per-frame when enabled
    if (!v) this.steerArrow.visible = false;
  }

  dispose(): void {
    this.fpsEl.remove();
    this.infoEl.remove();
    this.scene.remove(this.velArrow, this.steerArrow, this.hitboxGroup, this.edgeGroup);
  }
}

// Circle geometry in the XZ plane for LineLoop hitbox rings.
function buildCircleGeo(radius: number, segments: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// Edge line mirroring road.ts buildRibbon perpendicular logic.
// sign = +1: same offset direction as road.ts "left" variable; sign = -1: opposite.
function buildEdgeLine(pts: THREE.Vector3[], sign: number, color: number): THREE.Line {
  const edgePts: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const dir = new THREE.Vector3();
    if (i === 0) dir.subVectors(pts[1], pts[0]);
    else if (i === pts.length - 1) dir.subVectors(pts[i], pts[i - 1]);
    else dir.subVectors(pts[i + 1], pts[i - 1]);
    dir.normalize();
    const lateral = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(sign * ROAD_WIDTH / 2);
    edgePts.push(pts[i].clone().add(lateral).setY(0.03));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(edgePts),
    new THREE.LineBasicMaterial({ color }),
  );
}

function makeEl(styles: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    padding: '4px 10px',
    borderRadius: '4px',
    background: 'rgba(0,0,0,0.6)',
    color: '#0f0',
    userSelect: 'none',
    zIndex: '100',
    ...styles,
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  return el;
}
