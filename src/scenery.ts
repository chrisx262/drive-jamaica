import * as THREE from 'three';
import sceneryData from '../data/scenery.json';
import type { Road } from './road';

interface Strip { side: 'left' | 'right'; from: number; to: number; color: string; y: number }
interface Zone {
  segment: string;
  strips?: Strip[];
  mountains?: { distance: number; spread: number; count: number; color: string };
}

// Data-driven scenery zones (data/scenery.json), anchored to named route
// segments. V1: flat colored ribbons (sea, sand) + low-poly mountain backdrop.
// Replaced piece by piece as Overpass scatter and voxel assets land.
export function buildScenery(road: Road): THREE.Group {
  const group = new THREE.Group();
  for (const zone of sceneryData.zones as Zone[]) {
    const seg = road.segments.find((s) => s.name === zone.segment);
    if (!seg) continue;
    for (const strip of zone.strips ?? []) group.add(buildStrip(road, seg.from, seg.to, strip));
    if (zone.mountains) group.add(buildMountains(road, seg.to - 1, zone.mountains));
  }
  return group;
}

// Lateral ribbon offset from the route centerline between two point indices.
function buildStrip(road: Road, from: number, to: number, strip: Strip): THREE.Mesh {
  const left = strip.side === 'left';
  const positions: number[] = [];
  const indices: number[] = [];
  let n = 0;
  for (let i = from; i < to; i++) {
    const dir = new THREE.Vector3();
    if (i === 0) dir.subVectors(road.points[1], road.points[0]);
    else if (i === road.points.length - 1) dir.subVectors(road.points[i], road.points[i - 1]);
    else dir.subVectors(road.points[i + 1], road.points[i - 1]);
    dir.normalize();
    // Driver's left = up x dir; right is its negation.
    const offsetDir = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(left ? 1 : -1);
    const p = road.points[i];
    const a = p.clone().addScaledVector(offsetDir, strip.from);
    const b = p.clone().addScaledVector(offsetDir, strip.to);
    positions.push(a.x, strip.y, a.z, b.x, strip.y, b.z);
    if (n > 0) {
      const v = (n - 1) * 2;
      // Wind so faces point up; mirrored sides need mirrored winding.
      if (left) indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      else indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(strip.color) }));
}

// Low-poly peak backdrop placed ahead of the zone's end, spanning the horizon.
function buildMountains(road: Road, endIndex: number, m: { distance: number; spread: number; count: number; color: string }): THREE.Group {
  const group = new THREE.Group();
  const end = road.points[endIndex];
  const dir = end.clone().sub(road.points[endIndex - 1]).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(m.color), flatShading: true });
  const rng = mulberry32(7); // deterministic placement
  for (let i = 0; i < m.count; i++) {
    const along = (i / (m.count - 1) - 0.5) * m.spread;
    const height = 220 + rng() * 420;
    const radius = 350 + rng() * 600;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5 + Math.floor(rng() * 3)), mat);
    peak.position.copy(end)
      .addScaledVector(dir, m.distance + rng() * 1400)
      .addScaledVector(perp, along)
      .setY(height / 2 - 4);
    peak.rotation.y = rng() * Math.PI;
    group.add(peak);
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
