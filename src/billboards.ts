import * as THREE from 'three';
import billboardsData from '../data/billboards.json';
import type { Road } from './road';
import { narrate } from './narrator';

const POST_H = 7;        // post height (world units)
const BOARD_W = 7;       // board width
const BOARD_H = 3.5;     // board height
const LATERAL = 12;      // metres from road centreline

// Roadside billboard surfaces. Each billboard has a stable id (see data/billboards.json)
// for the future self-serve ad portal. V1 shows placeholder / house-ad copy.
export class Billboards {
  readonly object: THREE.Group;
  private narratorFired = false;
  private readonly triggerRadius: number[];

  constructor(road: Road) {
    this.object = new THREE.Group();
    this.triggerRadius = [];

    for (const entry of billboardsData.billboards) {
      const pos = road.project(entry.lat, entry.lon);
      const idx = road.nearestPointIndex(pos);
      const i = Math.min(idx, road.points.length - 2);
      const dir = road.points[i + 1].clone().sub(road.points[i]).normalize();

      // side: 'left' = driver's kerb side; 'right' = across the road
      const sign = entry.side === 'left' ? 1 : -1;
      const lateral = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(sign * LATERAL);

      const g = buildBillboard(entry.lines, pos, lateral);
      this.object.add(g);
      this.triggerRadius.push(entry.radius);
    }
  }

  // Call once per frame to fire the one-shot narrator line on first nearby billboard.
  update(carPos: THREE.Vector3): void {
    if (this.narratorFired) return;
    const children = this.object.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].position.distanceTo(carPos) < this.triggerRadius[i]) {
        this.narratorFired = true;
        narrate('billboard.first');
        return;
      }
    }
  }
}

function buildBillboard(lines: string[], roadPos: THREE.Vector3, lateral: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();

  // Place group at road position offset laterally; billboard face looks back toward road.
  g.position.copy(roadPos).add(lateral);
  g.position.y = 0;
  g.rotation.y = Math.atan2(-lateral.x, -lateral.z);

  // Posts
  const postMat = new THREE.MeshLambertMaterial({ color: 0x3d2b1a });
  const postGeo = new THREE.BoxGeometry(0.28, POST_H, 0.28);
  for (const ox of [-BOARD_W * 0.38, BOARD_W * 0.38]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(ox, POST_H / 2, 0);
    g.add(post);
  }

  // Frame backing (slightly larger than face, dark wood colour)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W + 0.28, BOARD_H + 0.28, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x2a1a0a }),
  );
  frame.position.set(0, POST_H + BOARD_H / 2, 0);
  g.add(frame);

  // Ad face — PlaneGeometry so DoubleSide works cleanly
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W, BOARD_H),
    new THREE.MeshLambertMaterial({ map: makeAdTexture(lines), side: THREE.DoubleSide }),
  );
  face.position.set(0, POST_H + BOARD_H / 2, 0.12);
  g.add(face);

  return g;
}

// Canvas texture — Jamaican gold background, green border and bold text.
function makeAdTexture(lines: string[]): THREE.CanvasTexture {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(cv);

  // Gold background
  ctx.fillStyle = '#fed100';
  ctx.fillRect(0, 0, W, H);

  // Green border
  ctx.strokeStyle = '#007749';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, W - 18, H - 18);

  // Centred text lines
  ctx.fillStyle = '#007749';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  const lineH = H / (n + 1);
  for (let i = 0; i < n; i++) {
    const fontSize = n === 1 ? 72 : n === 2 ? 56 : 44;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(lines[i], W / 2, (i + 1) * lineH, W - 36);
  }

  return new THREE.CanvasTexture(cv);
}
