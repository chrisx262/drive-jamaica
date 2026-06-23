import * as THREE from 'three';
import { makeCow } from './animals';
import type { Car } from './car';
import type { RoadLike } from './road';
import { narrate } from './narrator';

const ACTIVATE_DIST = 75;  // m — wake herd when car approaches
const HIT_RADIUS = 2.6;    // m — per-cow collision sphere
const CLEAR_AHEAD = 22;    // m past anchor before herd disperses
const REPAIR_DELAY = 10_000; // ms — auto-repair after cow hit
const COWS_PER_HERD = 4;

// Country road sections where cow herder events spawn (Linstead → Moneague)
const HERDER_SEGMENTS = new Set([
  'Pleasant Farm Road',
  'McGrath Road',
  'Linstead - Moneague Road',
]);

// Fractional positions within the collected herder zone for event placement
const EVENT_FRACTIONS = [0.15, 0.48, 0.78];

interface CowInstance {
  mesh: THREE.Group;
}

interface HerdEvent {
  anchorPos: THREE.Vector3;
  forward: THREE.Vector3;
  perp: THREE.Vector3;
  cows: CowInstance[];
  herderMesh: THREE.Group;
  state: 'idle' | 'active' | 'clearing';
  hit: boolean;
}

// Cow herder event: a man walks his cows along a country road, blocking the car.
// Slowing / swerving passes safely; hitting a cow damages the car and triggers
// a narrator scolding. Three events are spread across the Linstead–Moneague stretch.
export class CowHerder {
  readonly object: THREE.Group;
  private herds: HerdEvent[] = [];
  private sessionNarrated = false;
  private repairTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(road: RoadLike) {
    this.object = new THREE.Group();

    // Gather all route point indices that fall in herder segments
    const zone: number[] = [];
    for (let i = 0; i < road.points.length; i++) {
      const seg = road.segments.find((s) => i >= s.from && i < s.to);
      if (seg && HERDER_SEGMENTS.has(seg.name)) zone.push(i);
    }
    if (zone.length < 2) return;

    const rng = mulberry32(0x1d4c);

    for (const frac of EVENT_FRACTIONS) {
      const ptIdx = zone[Math.floor(frac * (zone.length - 1))];
      const pos = road.points[ptIdx];
      const nextPos = road.points[Math.min(ptIdx + 1, road.points.length - 1)];
      const forward = nextPos.clone().sub(pos).normalize();
      // Left perpendicular (road surface, looking forward)
      const perp = new THREE.Vector3(-forward.z, 0, forward.x);

      const cows: CowInstance[] = [];
      for (let ci = 0; ci < COWS_PER_HERD; ci++) {
        const lateral = (rng() - 0.5) * 7.0; // −3.5 .. +3.5 m across road
        const depth   = rng() * 9 - 2;        // −2 .. +7 m along road
        const cowPos = pos.clone()
          .addScaledVector(perp, lateral)
          .addScaledVector(forward, depth);
        cowPos.y = 0;
        const mesh = makeCow();
        mesh.position.copy(cowPos);
        mesh.rotation.y = rng() * Math.PI * 2;
        cows.push({ mesh });
      }

      const herderMesh = buildHerder();
      // Herder stands on left roadside slightly behind the cows
      const herderPos = pos.clone()
        .addScaledVector(perp, -5.5)
        .addScaledVector(forward, -4);
      herderPos.y = 0;
      herderMesh.position.copy(herderPos);
      herderMesh.rotation.y = Math.atan2(forward.x, forward.z);

      this.herds.push({ anchorPos: pos.clone(), forward, perp, cows, herderMesh, state: 'idle', hit: false });
      this.object.add(herderMesh);
      for (const c of cows) this.object.add(c.mesh);
    }
  }

  update(car: Car, dt: number): void {
    for (const herd of this.herds) {
      if (herd.state === 'idle') {
        if (herd.anchorPos.distanceTo(car.position) < ACTIVATE_DIST) {
          herd.state = 'active';
          if (!this.sessionNarrated) {
            narrate('cowherder.approach');
            this.sessionNarrated = true;
          }
        }
        continue;
      }

      if (herd.state === 'active') {
        // Gentle idle: cows turn heads (oscillate rotation)
        const t = performance.now() * 0.001;
        herd.cows.forEach((c, i) => {
          c.mesh.rotation.y = Math.sin(t * 0.6 + i * 1.5) * 0.3;
        });

        // Collision check — one narrated hit per herd
        if (!herd.hit) {
          for (const c of herd.cows) {
            if (c.mesh.position.distanceTo(car.position) < HIT_RADIUS) {
              herd.hit = true;
              if (!car.tyreBurst) car.burstTyre();
              narrate('cowherder.hit');
              clearTimeout(this.repairTimer);
              this.repairTimer = setTimeout(() => car.repairTyre(), REPAIR_DELAY);
              break;
            }
          }
        }

        // Once car is clearly past the herd, start clearing
        const ahead = car.position.clone().sub(herd.anchorPos).dot(herd.forward);
        if (ahead > CLEAR_AHEAD) herd.state = 'clearing';
        continue;
      }

      // state === 'clearing': herd shuffles off to the left roadside
      for (const c of herd.cows) {
        c.mesh.position.addScaledVector(herd.perp, 2.5 * dt);
      }
      herd.herderMesh.position.addScaledVector(herd.perp, 2.0 * dt);
    }
  }
}

function buildHerder(): THREE.Group {
  const g = new THREE.Group();
  const skinMat  = new THREE.MeshLambertMaterial({ color: 0xc68642, flatShading: true });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3b6c3f, flatShading: true });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x4a3728, flatShading: true });
  const woodMat  = new THREE.MeshLambertMaterial({ color: 0x6b4226, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.26), shirtMat);
  body.position.y = 1.0;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.30), skinMat);
  head.position.y = 1.49;

  // Wide-brimmed straw hat
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.52), woodMat);
  hat.position.y = 1.66;

  const legGeo = new THREE.BoxGeometry(0.14, 0.55, 0.14);
  for (const lx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(lx, 0.35, 0);
    g.add(leg);
  }

  // Herding stick
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), woodMat);
  stick.position.set(0.28, 0.85, 0);

  g.add(body, head, hat, stick);
  return g;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
