import * as THREE from 'three';

// Placeholder animal geometry (same pattern as car.ts box-placeholder).
// Each builder returns a THREE.Object3D sized to real-world scale.
// Replace the geometry block inside each function with a GLTFLoader load
// once GLB files land in assets/ (see assets/CREDITS.md).

export function makeGoat(): THREE.Group {
  const g = new THREE.Group();
  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.5, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c9, flatShading: true }),
  );
  body.position.y = 0.6;
  // Head
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.32, 0.35),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c9, flatShading: true }),
  );
  head.position.set(0, 0.98, 0.52);
  // Legs (four boxes)
  const legGeo = new THREE.BoxGeometry(0.1, 0.42, 0.1);
  const legMat = new THREE.MeshLambertMaterial({ color: 0xd0c8b8, flatShading: true });
  for (const [lx, lz] of [[-0.14, -0.3], [0.14, -0.3], [-0.14, 0.3], [0.14, 0.3]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.22, lz);
    g.add(leg);
  }
  g.add(body, head);
  return g;
}

export function makeDog(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.38, 0.75),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true }),
  );
  body.position.y = 0.42;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true }),
  );
  head.position.set(0, 0.7, 0.45);
  const legGeo = new THREE.BoxGeometry(0.09, 0.32, 0.09);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x7a4f27, flatShading: true });
  for (const [lx, lz] of [[-0.11, -0.24], [0.11, -0.24], [-0.11, 0.24], [0.11, 0.24]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.18, lz);
    g.add(leg);
  }
  g.add(body, head);
  return g;
}

export function makeCow(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.72, 1.5),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c9, flatShading: true }),
  );
  body.position.y = 0.95;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.48, 0.52),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c9, flatShading: true }),
  );
  head.position.set(0, 1.3, 0.9);
  const legGeo = new THREE.BoxGeometry(0.16, 0.68, 0.16);
  const legMat = new THREE.MeshLambertMaterial({ color: 0xd0c8b8, flatShading: true });
  for (const [lx, lz] of [[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.5], [0.24, 0.5]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.37, lz);
    g.add(leg);
  }
  g.add(body, head);
  return g;
}
