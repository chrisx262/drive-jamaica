import * as THREE from 'three';
import overpassData from '../data/overpass.json';

// ── ART_DIRECTION palette — board houses, concrete blocks, zinc-roofed shops ──
const BUILDING_WALL_COLORS = [
  0xe8e0c9, // cream concrete (most common)
  0x7fb5d5, // sky blue board house
  0x9fd6b1, // mint
  0xe8a9b8, // pink painted
  0xd4c9a8, // warm beige
] as const;
const BUILDING_ROOF_COL = 0x9aa0a6; // zinc grey roof
const TREE_TRUNK_COL    = 0x6b4c2a;
const TREE_CANOPY_COLS  = [0x3a7d2c, 0x2d5d23, 0x4e8c3a] as const;

// Each building gets a deterministic color + footprint from its position.
function buildHash(x: number, z: number): number {
  // integer mix — deterministic, spreads across color set
  let h = ((x * 1000) | 0) ^ ((z * 1000) | 0);
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b);
  return (h >>> 0); // unsigned
}

interface Feature { type: string; x: number; z: number; h?: number }

export function buildOverpassScatter(): THREE.Group {
  const group = new THREE.Group();
  const features = overpassData.features as Feature[];

  const buildings = features.filter((f) => f.type === 'building');
  const trees     = features.filter((f) => f.type === 'tree');

  if (buildings.length) group.add(...buildBuildings(buildings));
  if (trees.length)     group.add(buildOsmTrees(trees));

  return group;
}

// ── Buildings ─────────────────────────────────────────────────────────────────
function buildBuildings(buildings: Feature[]): THREE.Object3D[] {
  // Split by wall color → one InstancedMesh per color (5 draw calls max).
  const byColor: Feature[][] = Array.from({ length: BUILDING_WALL_COLORS.length }, () => []);
  for (const b of buildings) {
    const ci = buildHash(b.x, b.z) % BUILDING_WALL_COLORS.length;
    byColor[ci].push(b);
  }

  // A unit cube: we scale each instance to (width, height, depth) via dummy.
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 0.08, 1); // thin flat cap
  const roofMat = new THREE.MeshLambertMaterial({ color: BUILDING_ROOF_COL, flatShading: true });

  const out: THREE.Object3D[] = [];
  const dummy = new THREE.Object3D();

  for (let ci = 0; ci < BUILDING_WALL_COLORS.length; ci++) {
    const subset = byColor[ci];
    if (!subset.length) continue;
    const wallMat = new THREE.MeshLambertMaterial({
      color: BUILDING_WALL_COLORS[ci], flatShading: true,
    });
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, subset.length);
    const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, subset.length);

    for (let i = 0; i < subset.length; i++) {
      const b = subset[i];
      const hash = buildHash(b.x, b.z);
      const h = (b.h ?? 1);
      const wallH = h * 3.2;                        // world units per storey
      const w = 5 + (hash % 5);                     // footprint 5-9 wu wide
      const d = 4 + ((hash >> 4) % 5);              // footprint 4-8 wu deep

      // Wall: centered at footprint center, half-height above ground
      dummy.position.set(b.x, wallH * 0.5, b.z);
      dummy.scale.set(w, wallH, d);
      dummy.rotation.y = ((hash >> 8) % 4) * (Math.PI / 2); // 0°/90°/180°/270°
      dummy.updateMatrix();
      wallMesh.setMatrixAt(i, dummy.matrix);

      // Roof: sits on top of the wall
      dummy.position.set(b.x, wallH + 0.04, b.z);
      dummy.scale.set(w + 0.2, 1, d + 0.2); // slight overhang
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      roofMesh.setMatrixAt(i, dummy.matrix);
    }
    wallMesh.instanceMatrix.needsUpdate = true;
    roofMesh.instanceMatrix.needsUpdate = true;
    out.push(wallMesh, roofMesh);
  }
  return out;
}

// ── OSM-mapped individual trees ───────────────────────────────────────────────
// These are real mapped trees (natural=tree) or generated from the fallback.
// Visual style matches trees.ts broad canopy but smaller — they sit closer to
// the road edge than the procedural background trees.
function buildOsmTrees(trees: Feature[]): THREE.Group {
  const group = new THREE.Group();
  if (!trees.length) return group;

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 5, 1);
  const trunkMat = new THREE.MeshLambertMaterial({ color: TREE_TRUNK_COL, flatShading: true });
  const canopyGeo = new THREE.IcosahedronGeometry(1, 0);

  // Split by canopy color for minimal draw calls (3 InstancedMesh).
  const byColor: Feature[][] = [[], [], []];
  for (const t of trees) {
    byColor[(buildHash(t.x, t.z) >> 2) % TREE_CANOPY_COLS.length].push(t);
  }

  const dummy = new THREE.Object3D();
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  let trunkIdx = 0;

  for (let ci = 0; ci < TREE_CANOPY_COLS.length; ci++) {
    const subset = byColor[ci];
    if (!subset.length) continue;
    const canopyMat = new THREE.MeshLambertMaterial({
      color: TREE_CANOPY_COLS[ci], flatShading: true,
    });
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, subset.length);

    for (let i = 0; i < subset.length; i++) {
      const t = subset[i];
      const hash = buildHash(t.x, t.z);
      const scale = 0.5 + (hash % 6) * 0.1; // 0.5-1.0 scale
      const H = 3.5 * scale;

      dummy.position.set(t.x, H * 0.5, t.z);
      dummy.scale.set(scale, H, scale);
      dummy.rotation.set(0, (hash % 12) * (Math.PI / 6), 0);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(trunkIdx++, dummy.matrix);

      dummy.position.set(t.x, H + scale * 0.8, t.z);
      dummy.scale.setScalar(scale * 1.8);
      dummy.rotation.set(0, (hash % 8) * (Math.PI / 4), 0);
      dummy.updateMatrix();
      canopyMesh.setMatrixAt(i, dummy.matrix);
    }
    canopyMesh.instanceMatrix.needsUpdate = true;
    group.add(canopyMesh);
  }

  trunkMesh.count = trunkIdx;
  trunkMesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh);
  return group;
}
