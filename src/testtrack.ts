import * as THREE from 'three';
import type { RouteSegment } from './road';

// Flat closed oval for dev/debug use (?testtrack URL param).
// Satisfies the RoadLike interface so Potholes and the debug overlay work unchanged.
//
// Layout (all in meters, y=0):
//   Bottom straight:  x from -150 to +150, z = +60  (drive east)
//   Right semicircle: sweeping from z=+60 to z=-60 at x=+150
//   Top straight:     x from +150 to -150, z = -60  (drive west)
//   Left semicircle:  sweeping from z=-60 to z=+60 at x=-150
//
// Slalom cones on the bottom straight (8 cones, 25 m spacing).

const TRACK_WIDTH = 8;
const HALF_LEN = 150;
const RADIUS = 60;
const SEMI_STEPS = 24;
const STRAIGHT_STEPS = 20;

function buildOvalPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];

  // Bottom straight: x from -HALF_LEN → +HALF_LEN at z = +RADIUS
  for (let i = 0; i <= STRAIGHT_STEPS; i++) {
    pts.push(new THREE.Vector3(-HALF_LEN + (i / STRAIGHT_STEPS) * HALF_LEN * 2, 0, RADIUS));
  }
  // Right semicircle (center at x=+HALF_LEN, z=0): θ from π/2 down to -π/2 (clockwise)
  for (let i = 1; i <= SEMI_STEPS; i++) {
    const a = Math.PI / 2 - (i / SEMI_STEPS) * Math.PI;
    pts.push(new THREE.Vector3(HALF_LEN + Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS));
  }
  // Top straight: x from +HALF_LEN → -HALF_LEN at z = -RADIUS
  for (let i = 1; i <= STRAIGHT_STEPS; i++) {
    pts.push(new THREE.Vector3(HALF_LEN - (i / STRAIGHT_STEPS) * HALF_LEN * 2, 0, -RADIUS));
  }
  // Left semicircle (center at x=-HALF_LEN, z=0): θ from -π/2 down to -3π/2 (clockwise)
  for (let i = 1; i <= SEMI_STEPS; i++) {
    const a = -Math.PI / 2 - (i / SEMI_STEPS) * Math.PI;
    pts.push(new THREE.Vector3(-HALF_LEN + Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS));
  }

  return pts;
}

export class TestTrack {
  readonly object: THREE.Group;
  readonly points: THREE.Vector3[];
  readonly segments: RouteSegment[];
  /** Cone world positions — exposed so the debug overlay can draw hitbox rings. */
  readonly conePositions: THREE.Vector3[] = [];

  constructor() {
    this.points = buildOvalPoints();
    this.segments = [{ name: 'Test Track', from: 0, to: this.points.length - 1 }];
    this.object = new THREE.Group();
    this.object.add(
      this.buildRibbon(),
      this.buildCenterline(),
      this.buildGround(),
      this.buildCones(),
      this.buildSectorMarkers(),
    );
  }

  nearestPointIndex(pos: THREE.Vector3): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = this.points[i].distanceToSquared(pos);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  segmentAt(_pointIndex: number): RouteSegment {
    return this.segments[0];
  }

  // Unused in test-track mode; exists to keep TestTrack assignable to Road-like shapes.
  project(_lat: number, _lon: number): THREE.Vector3 {
    return new THREE.Vector3();
  }

  private buildRibbon(): THREE.Mesh {
    const pts = this.points;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const dir = this.dirAt(i);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(TRACK_WIDTH / 2);
      const left = pts[i].clone().add(perp);
      const right = pts[i].clone().sub(perp);
      positions.push(left.x, 0.01, left.z, right.x, 0.01, right.z);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3a3a3e }));
  }

  private buildCenterline(): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints(
      this.points.map((p) => new THREE.Vector3(p.x, 0.02, p.z))
    );
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xfed100, dashSize: 3, gapSize: 3 }));
    line.computeLineDistances();
    return line;
  }

  private buildGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 300),
      new THREE.MeshLambertMaterial({ color: 0x4e8c3a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    return ground;
  }

  // 8 orange slalom cones on the bottom straight, alternating inner/outer.
  // Even-indexed at z = 57.5 (driver's lane), odd at z = 62.5 (oncoming side).
  private buildCones(): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.ConeGeometry(0.3, 1.0, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const xs = [-90, -65, -40, -15, 10, 35, 60, 85];
    for (let i = 0; i < xs.length; i++) {
      const zOff = i % 2 === 0 ? 57.5 : 62.5;
      const pos = new THREE.Vector3(xs[i], 0.5, zOff);
      this.conePositions.push(pos.clone().setY(0));
      const cone = new THREE.Mesh(geo, mat);
      cone.position.copy(pos);
      group.add(cone);
    }
    return group;
  }

  // Checkerboard start/finish marker and sector labels on the ground.
  private buildSectorMarkers(): THREE.Group {
    const group = new THREE.Group();

    // Start/finish line: thin white stripe at x = -HALF_LEN on the bottom straight
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const lineGeo = new THREE.PlaneGeometry(0.5, TRACK_WIDTH);
    const startLine = new THREE.Mesh(lineGeo, lineMat);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(-HALF_LEN, 0.02, RADIUS);
    group.add(startLine);

    // Pothole zone marker (red stripe) ~ 80 m in, where Potholes will start spawning
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, transparent: true, opacity: 0.5 });
    const redGeo = new THREE.PlaneGeometry(0.4, TRACK_WIDTH);
    const potholeMarker = new THREE.Mesh(redGeo, redMat);
    potholeMarker.rotation.x = -Math.PI / 2;
    // 80 m from the start point along the bottom straight
    potholeMarker.position.set(-HALF_LEN + 80, 0.025, RADIUS);
    group.add(potholeMarker);

    return group;
  }

  private dirAt(i: number): THREE.Vector3 {
    const pts = this.points;
    const dir = new THREE.Vector3();
    if (i === 0) dir.subVectors(pts[1], pts[0]);
    else if (i === pts.length - 1) dir.subVectors(pts[i], pts[i - 1]);
    else dir.subVectors(pts[i + 1], pts[i - 1]);
    return dir.normalize();
  }
}
