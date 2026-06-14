// Overpass scatter pipeline: buildings + vegetation along the route -> data/overpass.json
// Run once offline (requires outbound internet to overpass-api.de).
// Usage: node scripts/fetch-overpass.mjs
//
// Output schema (data/overpass.json):
//   { comment, source, generated, features: [{ type, x, z, h? }] }
//   type: "building" | "tree" | "vegetation"
//   x, z: world coords (same projection as route.json)
//   h (buildings only): storey count (default 1)

import fs from 'node:fs';

const route = JSON.parse(fs.readFileSync(new URL('../data/route.json', import.meta.url)));
const { origin, scale, points } = route;

// ── Projection helpers (mirror of road.ts / fetch-route.mjs) ──────────────────
const mLat = 110574;
const mLon = 111320 * Math.cos((origin.lat * Math.PI) / 180);

function worldToLatLon([x, z]) {
  return {
    lat: origin.lat + -z / (mLat * scale),
    lon: origin.lon + x / (mLon * scale),
  };
}
function latLonToWorld(lat, lon) {
  return {
    x: +(( lon - origin.lon) * mLon * scale).toFixed(1),
    z: +(-(lat - origin.lat) * mLat * scale).toFixed(1),
  };
}

// ── Bounding box from route points ───────────────────────────────────────────
const latlons = points.map(worldToLatLon);
const latMin = Math.min(...latlons.map((p) => p.lat)) - 0.008;
const latMax = Math.max(...latlons.map((p) => p.lat)) + 0.008;
const lonMin = Math.min(...latlons.map((p) => p.lon)) - 0.008;
const lonMax = Math.max(...latlons.map((p) => p.lon)) + 0.008;
const bbox = `${latMin.toFixed(6)},${lonMin.toFixed(6)},${latMax.toFixed(6)},${lonMax.toFixed(6)}`;
console.log(`Bounding box: ${bbox}`);

// ── Overpass query ─────────────────────────────────────────────────────────
// We use "out center" so ways return their centroid, not full node lists.
// maxsize=16 MB keeps the download manageable; the script trims further.
const query = `[out:json][timeout:90][maxsize:16000000];
(
  node["natural"="tree"](${bbox});
  way["building"](${bbox});
  way["natural"~"^(wood|scrub|tree_row)$"](${bbox});
  way["landuse"~"^(forest|wood|orchard)$"](${bbox});
  relation["natural"~"^(wood|scrub)$"](${bbox});
  relation["landuse"~"^(forest|wood|orchard)$"](${bbox});
);
out center;`;

console.log('Querying Overpass API (overpass-api.de)…');
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'drive-jamaica-overpass-pipeline/1.0',
  },
  body: `data=${encodeURIComponent(query)}`,
});
if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
const data = await res.json();
console.log(`  Raw elements: ${data.elements.length}`);

// ── Project + classify elements ────────────────────────────────────────────
const features = [];
for (const el of data.elements) {
  let lat, lon;
  if (el.type === 'node') {
    lat = el.lat; lon = el.lon;
  } else if (el.center) {
    lat = el.center.lat; lon = el.center.lon;
  } else {
    continue; // way/relation without centre (shouldn't happen with out center)
  }

  const tags = el.tags ?? {};
  let type, h;

  if (el.type === 'node' && tags.natural === 'tree') {
    type = 'tree';
  } else if (tags.building) {
    type = 'building';
    h = Math.max(1, parseInt(tags['building:levels'] ?? '1', 10) || 1);
  } else if (tags.natural || tags.landuse) {
    type = 'vegetation';
  } else {
    continue;
  }

  const { x, z } = latLonToWorld(lat, lon);
  const f = { type, x, z };
  if (h && h > 1) f.h = h;
  features.push(f);
}
console.log(`  Projected: ${features.length} features`);

// ── Distance filter: drop elements too far from any road point ────────────
// Max real-world distance retained: 300 m → 90 world units at scale 0.3.
// We check against a thinned set of road points (every 8th) for speed.
const ROAD_MAX_DIST2 = 90 * 90; // world units squared
const samplePts = points.filter((_, i) => i % 8 === 0);
function nearRoad(x, z) {
  for (const [px, pz] of samplePts) {
    const dx = x - px, dz = z - pz;
    if (dx * dx + dz * dz < ROAD_MAX_DIST2) return true;
  }
  return false;
}
const nearby = features.filter((f) => nearRoad(f.x, f.z));
console.log(`  After road-distance filter (90 wu): ${nearby.length}`);

// ── Spatial thinning for buildings (cap density in Kingston) ──────────────
// Keep at most one building per 15×15 world-unit grid cell so urban areas
// don't overwhelm the scene. Trees and vegetation are kept as-is.
const buildingGrid = new Map();
const thinned = [];
for (const f of nearby) {
  if (f.type !== 'building') {
    thinned.push(f);
    continue;
  }
  const key = `${Math.floor(f.x / 15)},${Math.floor(f.z / 15)}`;
  if (!buildingGrid.has(key)) {
    buildingGrid.set(key, true);
    thinned.push(f);
  }
}
console.log(`  After building thinning: ${thinned.length} features`);

// ── Hard cap: 4000 buildings + 2000 trees to bound runtime cost ──────────
const buildings = thinned.filter((f) => f.type === 'building').slice(0, 4000);
const trees = thinned.filter((f) => f.type === 'tree').slice(0, 2000);
const veg = thinned.filter((f) => f.type === 'vegetation').slice(0, 1000);
const final = [...buildings, ...trees, ...veg];
console.log(`  Final: ${buildings.length} buildings, ${trees.length} trees, ${veg.length} veg`);

const out = {
  comment: 'Generated by scripts/fetch-overpass.mjs from OpenStreetMap via Overpass API. Do not hand-edit.',
  source: 'OpenStreetMap contributors (ODbL) via overpass-api.de',
  generated: new Date().toISOString(),
  routeBuffer: 90,
  features: final,
};
const outPath = new URL('../data/overpass.json', import.meta.url);
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote data/overpass.json (${(JSON.stringify(out).length / 1024).toFixed(0)} kB, ${final.length} features)`);
