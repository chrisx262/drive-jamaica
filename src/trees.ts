import * as THREE from 'three';
import treesData from '../data/trees.json';
import type { Road } from './road';

// Palette (ART_DIRECTION.md)
const TRUNK_COL = 0x6b4c2a;
const COCONUT_CROWN_COL = 0x2d5d23;
const BROAD_COLS = [0x3a7d2c, 0x2d5d23, 0x4e8c3a] as const;
// Bamboo: bright yellow-green culm + dark forest-green leaf cluster.
// Appears in Fern Gully (Milford Rd) and Bog Walk gorge only — per Jamaica accuracy rules
// (coconut trees must not appear on those stretches; bamboo is the correct vegetation).
const BAMBOO_CULM_COL = 0x9cbf2f;
const BAMBOO_LEAF_COL = 0x2d6b1f;

// Road half-width matches ROAD_WIDTH in road.ts — trees start beyond the edge.
const ROAD_HALF = 4;

// Placeholder low-poly geometry (same pattern as car.ts).
// When GLB assets land, swap buildTrees() to load them via GLTFLoader
// (see assets/CREDITS.md for sources + expected filenames).

type TreeKind = 'coconut' | 'broad' | 'bamboo';

interface TreePlacement {
  pos: THREE.Vector3;
  scale: number;
  rotY: number;
  kind: TreeKind;
  colorIdx: number;   // index into BROAD_COLS (broad trees only)
  crownTiltX: number; // slight lean variation
  crownTiltZ: number;
  canopyScale: number; // broad canopy radius multiplier
}

type SegmentConfig = number | { density: number; coconutFraction?: number; bambooFraction?: number };

function resolveSegment(
  cfg: SegmentConfig,
  globalCoconutFraction: number,
): { density: number; coconutFraction: number; bambooFraction: number } {
  if (typeof cfg === 'number') {
    return { density: cfg, coconutFraction: globalCoconutFraction, bambooFraction: 0 };
  }
  return {
    density: cfg.density,
    coconutFraction: cfg.coconutFraction ?? globalCoconutFraction,
    bambooFraction: cfg.bambooFraction ?? 0,
  };
}

function collectPlacements(road: Road, rng: () => number): TreePlacement[] {
  const out: TreePlacement[] = [];
  const segmentMap = treesData.segments as Record<string, SegmentConfig>;
  const {
    minLateralOffset: minOff,
    maxLateralOffset: maxOff,
    coconutFraction: globalCoconutFraction,
    defaultDensity,
  } = treesData as typeof treesData & { coconutFraction: number };

  let accumL = 0;
  let accumR = 0;

  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    const segLen = a.distanceTo(b);

    const seg = road.segmentAt(i - 1);
    const { density, coconutFraction, bambooFraction } = seg
      ? resolveSegment(segmentMap[seg.name] ?? defaultDensity, globalCoconutFraction)
      : { density: defaultDensity, coconutFraction: globalCoconutFraction, bambooFraction: 0 };

    const dir = b.clone().sub(a).normalize();
    // Driver's left = (dir.z, 0, -dir.x), right is its negation.
    const leftDir = new THREE.Vector3(dir.z, 0, -dir.x);

    accumL += segLen * density;
    accumR += segLen * density;

    const placeTree = (side: 1 | -1) => {
      const t = rng();
      const offset = ROAD_HALF + minOff + rng() * (maxOff - minOff);
      const r = rng();
      const kind: TreeKind =
        r < coconutFraction ? 'coconut'
        : r < coconutFraction + bambooFraction ? 'bamboo'
        : 'broad';
      out.push({
        pos: a.clone().lerp(b, t).addScaledVector(leftDir, side * offset),
        scale: 0.7 + rng() * 0.8,
        rotY: rng() * Math.PI * 2,
        kind,
        colorIdx: Math.floor(rng() * BROAD_COLS.length),
        crownTiltX: (rng() - 0.5) * 0.32,
        crownTiltZ: (rng() - 0.5) * 0.32,
        canopyScale: 2.2 + rng() * 0.9,
      });
    };

    while (accumL >= 1) { accumL -= 1; placeTree(1); }
    while (accumR >= 1) { accumR -= 1; placeTree(-1); }
  }

  return out;
}

export function buildTrees(road: Road): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(treesData.globalSeed);
  const all = collectPlacements(road, rng);
  const coconuts = all.filter((p) => p.kind === 'coconut');
  const broads = all.filter((p) => p.kind === 'broad');
  const bamboos = all.filter((p) => p.kind === 'bamboo');

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

  // --- Bamboo trees (Fern Gully, Bog Walk gorge) ---
  // Tall thin culm (bright green) with a flat spreading leaf cluster at top.
  // Each instance is a single culm; the dense scatter produces the grove effect.
  const BAMBOO_H = 9.0;
  if (bamboos.length > 0) {
    // Culm: thin tapered cylinder, bright yellow-green.
    const culmGeo = new THREE.CylinderGeometry(0.10, 0.18, 1, 6, 1);
    const culmMat = new THREE.MeshLambertMaterial({ color: BAMBOO_CULM_COL, flatShading: true });
    const culms = new THREE.InstancedMesh(culmGeo, culmMat, bamboos.length);

    // Leaf cluster: flat icosahedron (stretched wide, compressed tall) at the top.
    const leafGeo = new THREE.IcosahedronGeometry(1, 0);
    const leafMat = new THREE.MeshLambertMaterial({ color: BAMBOO_LEAF_COL, flatShading: true });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, bamboos.length);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < bamboos.length; i++) {
      const p = bamboos[i];
      const h = BAMBOO_H * p.scale;

      // Culm: very thin (0.3× scale in x/z), slight characteristic lean.
      dummy.position.copy(p.pos).setY(h * 0.5);
      dummy.rotation.set(p.crownTiltX * 0.5, p.rotY, p.crownTiltZ * 0.5);
      dummy.scale.set(p.scale * 0.3, h, p.scale * 0.3);
      dummy.updateMatrix();
      culms.setMatrixAt(i, dummy.matrix);

      // Leaf cluster: wide and flat (2× wide, 0.55× tall), leaning with culm.
      dummy.position.copy(p.pos).setY(h + p.scale * 0.5);
      dummy.rotation.set(p.crownTiltX, p.rotY, p.crownTiltZ);
      dummy.scale.set(p.scale * 2.0, p.scale * 0.55, p.scale * 2.0);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    }
    culms.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    group.add(culms, leaves);
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
