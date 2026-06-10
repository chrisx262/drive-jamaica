import * as THREE from 'three';
import routeData from '../data/route.json';

export interface RouteSegment {
  name: string;
  from: number;
  to: number;
}

const ROAD_WIDTH = 8; // two lanes; drive on the LEFT

export class Road {
  readonly object: THREE.Group;
  readonly points: THREE.Vector3[];
  readonly segments: RouteSegment[];

  constructor() {
    this.points = (routeData.points as [number, number][]).map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.segments = routeData.segments as RouteSegment[];
    this.object = new THREE.Group();
    this.object.add(this.buildRibbon(), this.buildCenterline(), this.buildGround());
  }

  // Triangle-strip ribbon along the polyline, offset by perpendiculars at each point.
  private buildRibbon(): THREE.Mesh {
    const pts = this.points;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const dir = new THREE.Vector3();
      if (i === 0) dir.subVectors(pts[1], pts[0]);
      else if (i === pts.length - 1) dir.subVectors(pts[i], pts[i - 1]);
      else dir.subVectors(pts[i + 1], pts[i - 1]);
      dir.normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(ROAD_WIDTH / 2);
      const left = pts[i].clone().add(perp);
      const right = pts[i].clone().sub(perp);
      positions.push(left.x, 0.01, left.z, right.x, 0.01, right.z);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
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
    return new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xfed100, dashSize: 3, gapSize: 3 }));
  }

  private buildGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshLambertMaterial({ color: 0x4e8c3a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    return ground;
  }

  // Index of the nearest polyline point — used by the recognition system.
  nearestPointIndex(pos: THREE.Vector3): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = this.points[i].distanceToSquared(pos);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  segmentAt(pointIndex: number): RouteSegment | undefined {
    return this.segments.find((s) => pointIndex >= s.from && pointIndex < s.to);
  }
}
