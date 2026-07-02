import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// Faith's Pen stop — optional pull-over at the famous roadside cookshops.
// Per GAME_SPEC: "Eating repairs tyre damage and gives a short feel-good boost;
// narrator celebrates the tradition. Skippable, but the game makes it tempting."
//
// Trigger: slow to < STOP_SPEED for STOP_DWELL seconds inside TRIGGER_RADIUS.
// Tyre is repaired on trigger even if not burst (repairTyre() is a no-op then).
// Once per session.

const TRIGGER_RADIUS = 220;   // world units — matches lmk-faiths-pen landmark radius
const APPROACH_RADIUS = 380;  // prompt appears here so the player has time to slow down
const STOP_SPEED = 5;         // m/s (~18 km/h) — slow enough to count as pulling over
const STOP_DWELL = 1.2;       // seconds of continuous low speed to trigger the stop

// Real lat/lon of Faith's Pen — matches lmk-faiths-pen in data/landmarks.json.
const LAT = 18.2347;
const LON = -77.0951;

export class FaithsPen {
  readonly object: THREE.Group;
  private readonly centre: THREE.Vector3;
  private approached = false;
  private eaten = false;
  private slowTimer = 0;
  private readonly promptEl: HTMLElement;
  private readonly notifEl: HTMLElement;

  constructor(road: Road) {
    this.centre = road.project(LAT, LON);
    this.object = buildStalls(this.centre);
    this.promptEl = makePromptEl();
    this.notifEl = makeNotifEl();
  }

  update(car: Car, dt: number): void {
    if (this.eaten) return;

    const dist = this.centre.distanceTo(car.position);

    // Show approach prompt once when the player gets close enough
    if (!this.approached && dist < APPROACH_RADIUS) {
      this.approached = true;
      this.promptEl.style.opacity = '1';
      narrate('faithspen.approach');
    }

    // Hide prompt once the player has clearly passed through without stopping
    if (this.approached && dist > APPROACH_RADIUS + 60) {
      this.promptEl.style.opacity = '0';
    }

    // Inside stop zone: accumulate slow time
    if (dist < TRIGGER_RADIUS) {
      if (Math.abs(car.speed) < STOP_SPEED) {
        this.slowTimer += dt;
        if (this.slowTimer >= STOP_DWELL) this.doEat(car);
      } else {
        this.slowTimer = 0;
      }
    } else {
      this.slowTimer = 0;
    }
  }

  private doEat(car: Car): void {
    this.eaten = true;
    this.promptEl.style.opacity = '0';
    car.repairTyre();
    narrate('faithspen.eat');
    this.notifEl.style.opacity = '1';
    setTimeout(() => { this.notifEl.style.opacity = '0'; }, 5500);
  }
}

// ---------------------------------------------------------------------------
// Scene geometry — three pairs of stalls on both verges of the road
// ---------------------------------------------------------------------------

function buildStalls(centre: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  // Stalls staggered 20 wu apart along the road (z-axis at this location)
  // Placed 13 wu either side of road centre (road edge is ±4 wu)
  const offsets = [-20, 0, 20];
  for (const dz of offsets) {
    g.add(buildSingleStall(centre.x + 13, centre.y, centre.z + dz));
    g.add(buildSingleStall(centre.x - 13, centre.y, centre.z + dz));
  }
  return g;
}

function buildSingleStall(x: number, y: number, z: number): THREE.Group {
  const stall = new THREE.Group();
  stall.position.set(x, y, z);

  // Concrete block walls — cream/beige Caribbean colour
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.2, 3.5),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c9, flatShading: true }),
  );
  walls.position.y = 1.1;
  stall.add(walls);

  // Zinc roof — slightly wider with an overhang, grey like corrugated zinc
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.18, 4.8),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a6, flatShading: true }),
  );
  roof.position.y = 2.3;
  stall.add(roof);

  // Jerk pan — dark steel drum with glowing "coals" cap
  const pan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.55, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a2020, flatShading: true }),
  );
  pan.position.set(0, 0.45, 1.4);
  stall.add(pan);

  const coals = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.44, 0.08, 8),
    new THREE.MeshLambertMaterial({ color: 0xe85d04, flatShading: true }),
  );
  coals.position.set(0, 0.77, 1.4);
  stall.add(coals);

  // Sign board — Jamaican gold, mounted above the roof line
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.85, 0.12),
    new THREE.MeshLambertMaterial({ color: 0xfed100, flatShading: true }),
  );
  sign.position.set(0, 2.85, 0);
  stall.add(sign);

  return stall;
}

// ---------------------------------------------------------------------------
// HUD elements
// ---------------------------------------------------------------------------

function makePromptEl(): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', bottom: '116px', left: '50%', transform: 'translateX(-50%)',
    padding: '11px 26px', borderRadius: '10px',
    background: 'rgba(100,20,0,0.90)', color: '#fed100',
    fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: '17px',
    opacity: '0', transition: 'opacity 0.4s', userSelect: 'none', textAlign: 'center',
    border: '2px solid #e85d04', letterSpacing: '0.01em',
    textShadow: '0 1px 3px rgba(0,0,0,0.6)', whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  el.innerHTML = '🍗 Faith\'s Pen ahead! Slow down for jerk chicken!<br>'
    + '<span style="font-size:13px;font-weight:600;opacity:0.85">'
    + 'Ease to 20 km/h to stop</span>';
  document.body.appendChild(el);
  return el;
}

function makeNotifEl(): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '24px 48px', borderRadius: '16px',
    background: 'rgba(0,0,0,0.86)', color: '#fed100',
    fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: '22px',
    opacity: '0', transition: 'opacity 0.4s', userSelect: 'none', textAlign: 'center',
    border: '3px solid #e85d04', pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  el.innerHTML = '🍗 Jerk chicken and festival — <span style="color:#e85d04">BLESSED!</span><br>'
    + '<span style="font-size:15px;font-weight:600;color:#fff">'
    + 'Belly full, ready fi drive! Gwaan!</span>';
  document.body.appendChild(el);
  return el;
}
