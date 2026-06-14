// Generates a synthetic data/overpass.json from route geometry when
// scripts/fetch-overpass.mjs cannot reach the Overpass API (e.g. CI / cloud env).
//
// Output schema matches the real fetcher exactly so src/overpass.ts is unaffected.
// Usage: node scripts/gen-overpass-fallback.mjs

import fs from 'node:fs';

const route = JSON.parse(fs.readFileSync(new URL('../data/route.json', import.meta.url)));
const { points, segments } = route;

// ── Seeded RNG (same Mulberry32 used in trees.ts / scenery.ts) ───────────────
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Segment character table ───────────────────────────────────────────────────
// For each named segment: building density (per world-unit per side),
// tree density, and typical storey count range.
const CHAR = {
  // ── Urban Kingston ──────────────────────────────────────────────────────
  'Sir Florizel Glaspole Boulevard':  { bld: 0.050, tree: 0.003, h: [1, 3] },
  'Windward Road':                    { bld: 0.055, tree: 0.002, h: [1, 3] },
  'Mountain View Avenue':             { bld: 0.050, tree: 0.003, h: [1, 2] },
  'Trafalgar Road':                   { bld: 0.040, tree: 0.008, h: [1, 4] },
  'Hope Road':                        { bld: 0.030, tree: 0.010, h: [1, 4] },
  'Hagley Park Road':                 { bld: 0.055, tree: 0.002, h: [1, 3] },
  'Eastwood Park Road':               { bld: 0.040, tree: 0.004, h: [1, 2] },
  'South Odeon Avenue':               { bld: 0.045, tree: 0.003, h: [1, 2] },
  'Bus Lane':                         { bld: 0.040, tree: 0.002, h: [1, 2] },
  'Spanish Town Road':                { bld: 0.045, tree: 0.002, h: [1, 3] },
  'Stanton Terrace':                  { bld: 0.040, tree: 0.004, h: [1, 2] },
  'Fairway Avenue':                   { bld: 0.035, tree: 0.005, h: [1, 2] },
  // ── Semi-urban ──────────────────────────────────────────────────────────
  'Nelson Mandela Highway':           { bld: 0.025, tree: 0.004, h: [1, 2] },
  'Twikenham Park Road':              { bld: 0.020, tree: 0.005, h: [1, 2] },
  'Twickenham Park Road':             { bld: 0.020, tree: 0.005, h: [1, 2] },
  'Burke Road':                       { bld: 0.025, tree: 0.004, h: [1, 2] },
  'Barrett Street':                   { bld: 0.030, tree: 0.003, h: [1, 2] },
  'White Church Street':              { bld: 0.030, tree: 0.003, h: [1, 2] },
  'Wellington Street':                { bld: 0.028, tree: 0.003, h: [1, 2] },
  'Spanish Town Bypass':              { bld: 0.018, tree: 0.005, h: [1, 2] },
  'Bog Walk Roundabout':              { bld: 0.015, tree: 0.006, h: [1, 2] },
  'Linstead Bypass':                  { bld: 0.018, tree: 0.004, h: [1, 2] },
  'Church Road':                      { bld: 0.030, tree: 0.004, h: [1, 2] },
  'Main Road':                        { bld: 0.025, tree: 0.005, h: [1, 2] },
  "King's Street":                    { bld: 0.028, tree: 0.004, h: [1, 2] },
  'Ocho Rios Bypass':                 { bld: 0.020, tree: 0.006, h: [1, 3] },
  'DaCosta Drive':                    { bld: 0.025, tree: 0.006, h: [1, 3] },
  'Northern Coastal Highway':         { bld: 0.020, tree: 0.008, h: [1, 3] },
  // ── Rural ───────────────────────────────────────────────────────────────
  'Sligoville Road':                  { bld: 0.008, tree: 0.008, h: [1, 1] },
  'Selassie Road':                    { bld: 0.006, tree: 0.008, h: [1, 1] },
  'Mahole Drive':                     { bld: 0.005, tree: 0.010, h: [1, 1] },
  'Walks Road':                       { bld: 0.006, tree: 0.010, h: [1, 1] },
  'River Road':                       { bld: 0.004, tree: 0.012, h: [1, 1] },
  'Linstead - Moneague Road':         { bld: 0.006, tree: 0.010, h: [1, 1] },
  'Pleasant Farm Road':               { bld: 0.004, tree: 0.008, h: [1, 1] },
  'McGrath Road':                     { bld: 0.004, tree: 0.008, h: [1, 1] },
  'Hibiscus Drive':                   { bld: 0.005, tree: 0.009, h: [1, 1] },
  'Moneague - Golden Grove Road':     { bld: 0.005, tree: 0.009, h: [1, 1] },
  'Moneague - Ocho Rios Road':        { bld: 0.005, tree: 0.009, h: [1, 1] },
  // ── Scenic / gorge (buildings scarce, trees dominant) ───────────────────
  'Bog Walk Gorge':                   { bld: 0.000, tree: 0.020, h: [1, 1] },
  'Bogwalk Gorge Road':               { bld: 0.000, tree: 0.018, h: [1, 1] },
  'Milford Road':                     { bld: 0.000, tree: 0.030, h: [1, 1] }, // Fern Gully
  // ── Airport / Palisadoes (no buildings, sparse scrub) ───────────────────
  'Sea Breeze Drive':                 { bld: 0.000, tree: 0.001, h: [1, 1] },
  'Airport Road':                     { bld: 0.002, tree: 0.001, h: [1, 1] },
  'Palisadoes Circle':                { bld: 0.001, tree: 0.001, h: [1, 1] },
  'Norman Manley Highway / Palisadoes Road': { bld: 0.000, tree: 0.001, h: [1, 1] },
};
const DEFAULT_CHAR = { bld: 0.006, tree: 0.006, h: [1, 1] };

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROAD_HALF = 4; // matches road.ts ROAD_WIDTH/2

function segCharAt(ptIdx) {
  const seg = segments.find((s) => ptIdx >= s.from && ptIdx < s.to);
  return seg ? (CHAR[seg.name] ?? DEFAULT_CHAR) : DEFAULT_CHAR;
}

function dirAt(i) {
  const a = i > 0 ? points[i - 1] : points[0];
  const b = i < points.length - 1 ? points[i + 1] : points[i];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  return [dx / len, dz / len];
}

// ── Generate features ─────────────────────────────────────────────────────────
const rng = mulberry32(271828);
const features = [];

let accumBldL = 0, accumBldR = 0, accumTreeL = 0, accumTreeR = 0;

for (let i = 1; i < points.length; i++) {
  const [ax, az] = points[i - 1];
  const [bx, bz] = points[i];
  const segLen = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
  const char = segCharAt(i - 1);

  const [dx, dz] = dirAt(i - 1);
  // Perpendicular directions: left = (+dz, -dx), right = (-dz, +dx) in XZ
  const leftX = dz, leftZ = -dx;

  accumBldL += segLen * char.bld;
  accumBldR += segLen * char.bld;
  accumTreeL += segLen * char.tree;
  accumTreeR += segLen * char.tree;

  while (accumBldL >= 1) {
    accumBldL -= 1;
    const t = rng();
    const offset = ROAD_HALF + 6 + rng() * 32; // 6-38 wu from road edge
    const x = +(ax + (bx - ax) * t + leftX * offset).toFixed(1);
    const z = +(az + (bz - az) * t + leftZ * offset).toFixed(1);
    const [hMin, hMax] = char.h;
    const h = hMin + Math.floor(rng() * (hMax - hMin + 1));
    const f = { type: 'building', x, z };
    if (h > 1) f.h = h;
    features.push(f);
  }

  while (accumBldR >= 1) {
    accumBldR -= 1;
    const t = rng();
    const offset = ROAD_HALF + 6 + rng() * 32;
    const x = +(ax + (bx - ax) * t - leftX * offset).toFixed(1);
    const z = +(az + (bz - az) * t - leftZ * offset).toFixed(1);
    const [hMin, hMax] = char.h;
    const h = hMin + Math.floor(rng() * (hMax - hMin + 1));
    const f = { type: 'building', x, z };
    if (h > 1) f.h = h;
    features.push(f);
  }

  while (accumTreeL >= 1) {
    accumTreeL -= 1;
    const t = rng();
    const offset = ROAD_HALF + 3 + rng() * 12; // close to road edge
    const x = +(ax + (bx - ax) * t + leftX * offset).toFixed(1);
    const z = +(az + (bz - az) * t + leftZ * offset).toFixed(1);
    features.push({ type: 'tree', x, z });
  }

  while (accumTreeR >= 1) {
    accumTreeR -= 1;
    const t = rng();
    const offset = ROAD_HALF + 3 + rng() * 12;
    const x = +(ax + (bx - ax) * t - leftX * offset).toFixed(1);
    const z = +(az + (bz - az) * t - leftZ * offset).toFixed(1);
    features.push({ type: 'tree', x, z });
  }
}

console.log(`Generated: ${features.filter(f=>f.type==='building').length} buildings, ${features.filter(f=>f.type==='tree').length} trees`);

const out = {
  comment: 'Synthetic fallback generated by scripts/gen-overpass-fallback.mjs (no real OSM data). Replace with fetch-overpass.mjs output when network access is available.',
  source: 'synthetic (based on segment character table)',
  generated: new Date().toISOString(),
  routeBuffer: 90,
  features,
};
fs.writeFileSync(new URL('../data/overpass.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote data/overpass.json (${(JSON.stringify(out).length / 1024).toFixed(0)} kB, ${features.length} total features)`);
