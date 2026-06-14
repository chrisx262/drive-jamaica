import * as THREE from 'three';
import treesData from '../data/trees.json';
import type { Road } from './road';

// Palette (ART_DIRECTION.md)
const TRUNK_COL = 0x6b4c2a;
const COCONUT_CROWN_COL = 0x2d5d23;
const BROAD_COLS = [0x3a7d2c, 0x2d5d23, 0x4e8c3a] as const;

// Road half-width matches ROAD_WIDTH in road.ts — trees start beyond the edge.
const ROAD_HALF = 4;

// Placeholder low-poly geometry (same pattern as car.ts).
// When GLB assets land, swap buildTrees() to load them via GLTFLoader
// (see assets/CREDITS.md for sources + expected filenames).

interface TreePlacement {
  pos: THREE.Vector3;
  scale: number;
  rotY: number;
  isCoconut: boolean;
  colorIdx: number;   // index into BROAD_COLS (broad trees only)
  crownTiltX: number; // slight lean variation (coconut trees only)
  crownTiltZ: number;
  canopyScale: number; // broad canopy radius multiplier
}

function collectPlacements(road: Road, rng: () => number): TreePlacement[] {
  const out: TreePlacement[] = [];
  const densityMap = treesData.segments as Record<string, number>;
  const { minLateralOffset: minOff, maxLateralOffset: maxOff, coconutFraction, defaultDensity } = treesData as typeof treesData & { coconutFraction: number };

  let accumL = 0;
  let accumR = 0;

  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    const segLen = a.distanceTo(b);

    const seg = road.segmentAt(i - 1);
    const density = seg ? (densityMap[seg.name] ?? defaultDensity) : defaultDensity;

    const dir = b.clone().sub(a).normalize();
    // Driver's left = (dir.z, 0, -dir.x), right is its negation.
    const leftDir = new THREE.Vector3(dir.z, 0, -dir.x);

    accumL += segLen * density;
    accumR += segLen * density;

    while (accumL >= 1) {
      accumL -= 1;
      const t = rng();
      const offset = ROAD_HALF + minOff + rng() * (maxOff - minOff);
      out.push({
        pos: a.clone().lerp(b, t).addScaledVector(leftDir, offset),
        scale: 0.7 + rng() * 0.8,
        rotY: rng() * Math.PI * 2,
        isCoconut: rng() < coconutFraction,
        colorIdx: Math.floor(rng() * BROAD_COLS.length),
        crownTiltX: (rng() - 0.5) * 0.32,
        crownTiltZ: (rng() - 0.5) * 0.32,
        canopyScale: 2.2 + rng() * 0.9,
      });
    }

    while (accumR >= 1) {
      accumR -= 1;
      const t = rng();
      const offset = ROAD_HALF + minOff + rng() * (maxOff - minOff);
      out.push({
        pos: a.clone().lerp(b, t).addScaledVector(leftDir, -offset),
        scale: 0.7 + rng() * 0.8,
        rotY: rng() * Math.PI * 2,
        isCoconut: rng() < coconutFraction,
        colorIdx: Math.floor(rng() * BROAD_COLS.length),
        crownTiltX: (rng() - 0.5) * 0.32,
        crownTiltZ: (rng() - 0.5) * 0.32,
        canopyScale: 2.2 + rng() * 0.9,
      });
    }
  }

  return out;
}

export function buildTrees(road: Road): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(treesData.globalSeed);
  const all = collectPlacements(road, rng);
  const coconuts = all.filter((p) => p.isCoconut);
  const broads = all.filter((p) => !p.isCoconut);

  // Shared trunk geometry: unit cylinder, slightly tapered, flat-shaded.
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 1, 5, 1);
  const trunkMat = new THREE.MeshLambertMaterial({ color: TRUNK_COL, flatShading: true });

  // --- Coconut trees ---
  // Tall trunk ~7.5 game-units; single cone crown at top with characteristic lean.
  const COCONUT_H = 7.5;
  if (coconuts.length > 0) {
    const coconutTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, coconuts.length);

    const coconutCrownGeo = new THREE.ConeGeometry(1.8, 1.6, 5, 1);
    const coconutCrownMat = new THREE.MeshLambertMaterial({ color: COCONUT_CROWN_COL, flatShading: true });
    const coconutCrowns = new THREE.InstancedMesh(coconutCrownGeo, coconutCrownMat, coconuts.length);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < coconuts.length; i++) {
      const p = coconuts[i];
      const h = COCONUT_H * p.scale;

      dummy.position.copy(p.pos).setY(h * 0.5);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(p.scale, h, p.scale);
      dummy.updateMatrix();
      coconutTrunks.setMatrixAt(i, dummy.matrix);

      dummy.position.copy(p.pos).setY(h + 0.6 * p.scale);
      dummy.rotation.set(p.crownTiltX, p.rotY, p.crownTiltZ);
      dummy.scale.setScalar(p.scale * 1.1);
      dummy.updateMatrix();
      coconutCrowns.setMatrixAt(i, dummy.matrix);
    }
    coconutTrunks.instanceMatrix.needsUpdate = true;
    coconutCrowns.instanceMatrix.needsUpdate = true;
    group.add(coconutTrunks, coconutCrowns);
  }

  // --- Broad canopy trees (mango / breadfruit / ackee) ---
  // Trunk height ~5 game-units; icosahedron canopy for low-poly silhouette.
  const BROAD_H = 5.0;
  if (broads.length > 0) {
    const broadTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broads.length);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 0);

    // Split by color for minimal draw calls (3 InstancedMesh).
    const byColor = [0, 1, 2].map((ci) => broads.filter((p) => p.colorIdx === ci));
    const canopyMeshes = byColor.map((subset, ci) => {
      if (!subset.length) return null;
      const mat = new THREE.MeshLambertMaterial({ color: BROAD_COLS[ci], flatShading: true });
      return new THREE.InstancedMesh(canopyGeo, mat, subset.length);
    });

    const dummy = new THREE.Object3D();
    for (let i = 0; i < broads.length; i++) {
      const p = broads[i];
      const h = BROAD_H * p.scale;
      dummy.position.copy(p.pos).setY(h * 0.5);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(p.scale, h, p.scale);
      dummy.updateMatrix();
      broadTrunks.setMatrixAt(i, dummy.matrix);
    }
    broadTrunks.instanceMatrix.needsUpdate = true;
    group.add(broadTrunks);

    for (let ci = 0; ci < 3; ci++) {
      const mesh = canopyMeshes[ci];
      const subset = byColor[ci];
      if (!mesh || !subset.length) continue;
      for (let i = 0; i < subset.length; i++) {
        const p = subset[i];
        const h = BROAD_H * p.scale;
        dummy.position.copy(p.pos).setY(h + p.scale * 1.4);
        dummy.rotation.set(p.crownTiltX, p.rotY, p.crownTiltZ);
        dummy.scale.setScalar(p.scale * p.canopyScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
  }

  return group;
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
