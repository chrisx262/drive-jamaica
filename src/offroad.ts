import * as THREE from 'three';
import type { RoadLike } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Mount Rosser wrong-turn zone — "Linstead - Moneague Road" (route points 458–628).
// GAME_SPEC §Gameplay: "wrong turn option in the hill country (Moneague/Mount Rosser stretch)
//   that becomes potholes-then-no-road on a mountainside."
const ZONE_FROM  = 458;
const ZONE_TO    = 628;
const FORK_IDX   = 540; // mid-mountain stretch — where the dirt spur branches off

const WARN_MS       = 3_000; // narrator warns after 3 s off-road
const TYRE_MS       = 8_000; // tyre bursts on the rockstone after 8 s
const NO_ROAD_MS   = 15_000; // "road done finish" HUD after 15 s
const RETURN_DIST   = 14;    // world units back to route → back on road
const PATCH_AFTER   = 18_000; // auto-repair, matching potholes.ts convention

export class OffRoad {
  readonly object: THREE.Group;
  private pts: THREE.Vector3[];
  private offMs = 0;
  private warnDone   = false;
  private tyreDone   = false;
  private noroadDone = false;
  private repairTimer: ReturnType<typeof setTimeout> | undefined;
  private hudEl: HTMLElement | null = null;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();
    this.pts = road.points;

    // Test-track guard: test track has ~89 points — zone would be out of range.
    if (road.points.length <= ZONE_TO) return;

    this.object.add(buildSpur(road.points));
    this.hudEl = buildHud();
  }

  update(car: Car, dt: number): void {
    if (this.pts.length <= ZONE_TO) return;

    // Nearest route point across the whole route — O(n) over ~840 pts, trivial at 60 fps.
    const nearIdx = nearestIdx(this.pts, car.position);

    // Only process when the nearest route point is inside the mountain zone.
    if (nearIdx < ZONE_FROM || nearIdx >= ZONE_TO) {
      if (this.offMs > 0) this.reset();
      return;
    }

    const distToRoute = car.position.distanceTo(this.pts[nearIdx]);

    if (distToRoute < RETURN_DIST) {
      if (this.offMs >= WARN_MS) narrate('offroad.return');
      this.reset();
      return;
    }

    // Car is off-road in the mountain zone — advance timer and fire events.
    this.offMs += dt * 1000;

    if (!this.warnDone && this.offMs >= WARN_MS) {
      this.warnDone = true;
      narrate('offroad.warn');
    }

    if (!this.tyreDone && this.offMs >= TYRE_MS) {
      this.tyreDone = true;
      if (!car.tyreBurst) {
        car.burstTyre();
        narrate('offroad.tyre');
        // Auto-repair after PATCH_AFTER ms (same convention as potholes.ts).
        clearTimeout(this.repairTimer);
        this.repairTimer = setTimeout(() => {
          car.repairTyre();
          narrate('tyre.fixed');
        }, PATCH_AFTER);
      }
    }

    if (!this.noroadDone && this.offMs >= NO_ROAD_MS) {
      this.noroadDone = true;
      narrate('offroad.noroad');
      if (this.hudEl) this.hudEl.style.display = 'block';
    }
  }

  private reset(): void {
    this.offMs = 0;
    this.warnDone   = false;
    this.tyreDone   = false;
    this.noroadDone = false;
    if (this.hudEl) this.hudEl.style.display = 'none';
    // repairTimer is intentionally NOT cleared — if a tyre was burst,
    // the repair fires regardless of whether the player returned to road.
  }
}

// Dirt spur geometry: a short ochre-brown track branching off the main road,
// narrowing to nothing at the dead end on the mountainside.
function buildSpur(pts: THREE.Vector3[]): THREE.Group {
  const g = new THREE.Group();
  if (pts.length <= FORK_IDX + 1) return g;

  const fork = pts[FORK_IDX];
  const fwd   = pts[FORK_IDX + 1].clone().sub(fork).normalize();
  // Perpendicular rotated 90° clockwise in XZ (right of the road when driving forward).
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

  // Spur angles forward-right at a 30/60 split — looks like an inviting mountain track.
  const spurDir = new THREE.Vector3().addScaledVector(fwd, 0.5).addScaledVector(right, 0.87).normalize();
  const spurPerp = new THREE.Vector3(-spurDir.z, 0, spurDir.x); // perpendicular to spur

  const N    = 8;    // segments
  const STEP = 25;   // world units per segment
  // Start 4 units off the right edge of the main road ribbon.
  const origin = fork.clone().addScaledVector(right, 4);

  const positions: number[] = [];
  const idxs: number[] = [];

  for (let i = 0; i <= N; i++) {
    const t  = i / N;
    const pt = origin.clone().addScaledVector(spurDir, i * STEP);
    // Half-width narrows from 2.5 m (5 m road) to 0.5 m (1 m barely-a-track).
    const hw = THREE.MathUtils.lerp(2.5, 0.5, t);
    positions.push(
      pt.x + spurPerp.x * hw, 0.005, pt.z + spurPerp.z * hw,
      pt.x - spurPerp.x * hw, 0.005, pt.z - spurPerp.z * hw,
    );
    if (i > 0) {
      const a = (i - 1) * 2;
      idxs.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(idxs);
  geo.computeVertexNormals();
  // Laterite/ochre colour — red-brown dirt, distinct from dark tarmac.
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x8d4f1a })));
  return g;
}

function buildHud(): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    top: '42%',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 26px',
    borderRadius: '6px',
    background: 'rgba(160, 20, 0, 0.90)',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '900',
    fontSize: '22px',
    textAlign: 'center',
    display: 'none',
    userSelect: 'none',
    zIndex: '90',
  } satisfies Partial<CSSStyleDeclaration>);
  el.textContent = 'Road done finish — turn back!';
  document.body.appendChild(el);
  return el;
}

function nearestIdx(pts: THREE.Vector3[], pos: THREE.Vector3): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = pts[i].distanceToSquared(pos);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
