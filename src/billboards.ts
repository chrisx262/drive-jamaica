import * as THREE from 'three';
import type { Road } from './road';
import billboardData from '../data/billboards.json';

// V1 billboard system. Each surface has a stable id (see data/billboards.json)
// which the Phase-2 self-serve ad backend will key on — do NOT change ids.
// In V1 all faces show Jamaican-flavoured placeholder creatives rendered from
// canvas. The four variants share textures; only 4 CanvasTexture objects live
// in GPU memory regardless of how many billboards are placed.

export interface BillboardRecord {
  id: string;
  lat: number;
  lon: number;
  side: 'left' | 'right';
  label: string;
  variant: 'a' | 'b' | 'c' | 'd';
  notes?: string;
}

const FACE_W = 8;        // face width, world metres
const FACE_H = 4;        // face height
const POST_H = 5;        // post height
const SIDE_OFFSET = 11;  // distance from road centre to post base

// Canvas textures are created lazily and shared across all billboards using
// the same variant — only 4 textures ever exist in GPU memory.
const _cache = new Map<string, THREE.CanvasTexture>();

function buildTexture(bg: string, fg: string, line1: string, line2: string): THREE.CanvasTexture {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = fg;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 46px Arial, sans-serif';
  ctx.fillText(line1, W / 2, H * 0.38);

  ctx.font = '30px Arial, sans-serif';
  ctx.fillText(line2, W / 2, H * 0.70);

  return new THREE.CanvasTexture(cv);
}

function tex(variant: string): THREE.CanvasTexture {
  if (!_cache.has(variant)) {
    switch (variant) {
      case 'a': _cache.set('a', buildTexture('#006b3f', '#fed100', 'ADVERTISE HERE', 'drive-jamaica.com')); break;
      case 'b': _cache.set('b', buildTexture('#fed100', '#000000', 'BIG UP JAMAICA', 'drive-jamaica.com')); break;
      case 'c': _cache.set('c', buildTexture('#000000', '#fed100', 'DRIVE LEFT, MON', 'ALWAYS. NO EXCEPTIONS.')); break;
      case 'd': _cache.set('d', buildTexture('#006b3f', '#ffffff', "FAITH'S PEN", 'BEST JERK IN JAMAICA')); break;
      default:  _cache.set(variant, buildTexture('#006b3f', '#fed100', 'ADVERTISE HERE', 'drive-jamaica.com'));
    }
  }
  return _cache.get(variant)!;
}

// Shared geometries (created once).
const _postGeo = new THREE.BoxGeometry(0.4, POST_H, 0.4);
const _frameGeo = new THREE.BoxGeometry(FACE_W + 0.4, FACE_H + 0.4, 0.18);
const _faceGeo = new THREE.PlaneGeometry(FACE_W, FACE_H);
const _postMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
const _frameMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _backMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

export class Billboards {
  readonly object: THREE.Group;
  /** All billboard records — stable ids accessible for debugging or future ad system. */
  readonly records: BillboardRecord[];

  constructor(road: Road) {
    this.object = new THREE.Group();
    this.records = billboardData.billboards as BillboardRecord[];

    for (const rec of this.records) {
      const roadPos = road.project(rec.lat, rec.lon);

      // Road direction at nearest point.
      const ni = Math.min(road.nearestPointIndex(roadPos), road.points.length - 2);
      const dir = road.points[ni + 1].clone().sub(road.points[ni]).normalize();
      // Left-hand perpendicular (relative to direction of travel, driving on the left).
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);

      const sign = rec.side === 'left' ? 1 : -1;
      const billPos = roadPos.clone().addScaledVector(perp, sign * SIDE_OFFSET);
      billPos.y = 0;

      const group = new THREE.Group();
      group.position.copy(billPos);
      // Make the face (+Z of group) point toward the road centre.
      group.lookAt(new THREE.Vector3(roadPos.x, 0, roadPos.z));

      // Post
      const post = new THREE.Mesh(_postGeo, _postMat);
      post.position.y = POST_H / 2;
      group.add(post);

      // Frame (sits just behind the face)
      const frame = new THREE.Mesh(_frameGeo, _frameMat);
      frame.position.set(0, POST_H + FACE_H / 2, -0.1);
      group.add(frame);

      // Face (front — shows creative)
      const face = new THREE.Mesh(
        _faceGeo,
        new THREE.MeshLambertMaterial({ map: tex(rec.variant), side: THREE.FrontSide })
      );
      face.position.y = POST_H + FACE_H / 2;
      group.add(face);

      // Back (plain dark panel)
      const back = new THREE.Mesh(_faceGeo, _backMat);
      back.position.set(0, POST_H + FACE_H / 2, -0.22);
      back.rotation.y = Math.PI;
      group.add(back);

      this.object.add(group);
    }
  }
}
