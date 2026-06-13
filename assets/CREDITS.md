# Asset Credits

All assets used in Drive Jamaica are CC0 (public domain) or explicitly licensed
for free commercial use without attribution. This file documents each source.

---

## Current state: procedural geometry placeholders

The tree, animal, and foliage assets in `src/trees.ts` and `src/animals.ts` are
built from Three.js primitive geometry (same approach as the placeholder Corolla
in `src/car.ts`). The runtime systems are fully wired and ready to accept GLB
files — see the "How to upgrade" notes under each asset below.

---

## Trees & Foliage

### Palm trees (coconut / royal)
- **Intended source:** Kenney.nl — Nature Kit  
  URL: https://kenney.nl/assets/nature-kit  
  License: CC0 1.0 Universal  
  Expected file: `assets/palm_tree.glb` (export from the Nature Kit `.blend` / `.obj`)

### Broad canopy trees (mango, breadfruit, poinciana)
- **Intended source:** Kenney.nl — Nature Kit (same pack, "broad_tree" mesh)  
  License: CC0 1.0 Universal  
  Expected file: `assets/broad_tree.glb`

### Bamboo clumps
- **Intended source:** Quaternius — Tropical Pack  
  URL: https://quaternius.com/packs/ultimatenature.html  
  License: CC0 1.0 Universal  
  Expected file: `assets/bamboo.glb`

### Coconut palm (alternate, more stylized)
- **Intended source:** poly.pizza — "Low Poly Palm Tree" by Poly by Google  
  URL: https://poly.pizza/m/dLHpzNdygsg  
  License: CC0 / Public Domain  
  Expected file: `assets/palm_lowpoly.glb`

**How to upgrade trees:** Once GLBs are in `assets/`, replace the
`buildTrees()` geometry in `src/trees.ts` with a `GLTFLoader` load of the
appropriate file. The placement/instancing system in `buildTrees()` does not
change; only the per-instance geometry source changes.

---

## Animals

### Goat
- **Intended source:** Quaternius — Ultimate Animal Pack  
  URL: https://quaternius.com/packs/ultimateanimalpack.html  
  License: CC0 1.0 Universal  
  Expected file: `assets/goat.glb`  
  Recolor target: cream body `#e8e0c9`, dark horns `#3a2e1e`

### Brown dog
- **Intended source:** Quaternius — Ultimate Animal Pack (same pack, "dog" mesh)  
  License: CC0 1.0 Universal  
  Expected file: `assets/dog.glb`  
  Recolor target: brown `#8b5a2b` with black nose

### Cow
- **Intended source:** Quaternius — Ultimate Animal Pack (same pack, "cow" mesh)  
  License: CC0 1.0 Universal  
  Expected file: `assets/cow.glb`  
  Recolor target: white/brown patch `#e8e0c9` / `#8b5a2b`

**How to upgrade animals:** `src/animals.ts` exports stub placement functions
that currently render box stand-ins. Replace the geometry inside each function
with a `GLTFLoader` load of the corresponding GLB. The event/trigger logic
(chasing, herding) in each function is independent of the visual geometry.

---

## Vehicles

### Route taxi (Probox)
- **Intended source:** Kenney.nl — Car Kit  
  URL: https://kenney.nl/assets/car-kit  
  License: CC0 1.0 Universal  
  Expected file: `assets/probox_taxi.glb`  
  Recolor: white body, red number plate area (Jamaica route-taxi livery)

---

## OpenStreetMap data

Route geometry (`data/route.json`) is derived from OpenStreetMap via OSRM.  
© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright

---

## Note on palette

All assets should be recolored to the palette in `ART_DIRECTION.md` before
committing GLB files. Recommended workflow: import into Blender, apply a simple
material with the target hex color, export as GLB with Draco compression at
quality 6. Target file size: ≤ 50 KB per unique asset.
