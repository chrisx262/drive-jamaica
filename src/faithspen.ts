import * as THREE from 'three';
import type { Car } from './car';
import type { Road } from './road';
import { narrate } from './narrator';

// Faith's Pen cookshop stop — GAME_SPEC §Gameplay:
// "Optional pull-over at the famous roadside cookshops — jerk chicken, roast yam, festival.
//  Eating repairs tyre damage and gives a short feel-good boost; narrator celebrates the
//  tradition. Skippable, but the game makes it tempting."
//
// Mechanic: HUD prompt appears when within 100 m.  Slow to < 12 km/h and hold
// within 45 m for 2.2 s — the stop triggers, tyre repaired, narrator fires.
// One-time per session; skippable (drive past at speed and it never fires).

const LAT = 18.2347;
const LON = -77.0951; // matches lmk-faiths-pen in landmarks.json

const PROMPT_RADIUS = 100; // m — HUD prompt appears when this close
const STOP_RADIUS = 45;    // m — must be this close to count dwell time
const SLOW_KMH = 12;       // km/h — speed at or below this counts as pulling over
const DWELL_MS = 2200;     // ms of continuous slow driving before stop triggers

export class FaithsPen {
  readonly object: THREE.Group;
  private readonly center: THREE.Vector3;
  private readonly promptEl: HTMLElement;
  private readonly progressEl: HTMLElement;
  private done = false;
  private approachFired = false;
  private slowMs = 0;

  constructor(road: Road) {
    this.object = new THREE.Group();
    this.center = road.project(LAT, LON);
    this.center.y = 0;
    this.buildStalls(road);
    this.promptEl = createPromptEl();
    this.progressEl = createProgressEl();
  }

  update(car: Car, dt: number): void {
    if (this.done) return;

    const dist = car.position.distanceTo(this.center);

    if (dist < PROMPT_RADIUS) {
      this.promptEl.style.display = 'block';

      if (!this.approachFired) {
        this.approachFired = true;
        narrate('faithspen.approach');
      }

      if (dist < STOP_RADIUS && car.speedKmh < SLOW_KMH) {
        this.slowMs += dt * 1000;
        const frac = Math.min(this.slowMs / DWELL_MS, 1);
        const filled = Math.round(frac * 8);
        this.progressEl.style.display = 'block';
        this.progressEl.textContent =
          `Jerk chicken heating up... ${'█'.repeat(filled)}${'░'.repeat(8 - filled)}`;

        if (this.slowMs >= DWELL_MS) {
          this.triggerStop(car);
        }
      } else {
        this.slowMs = 0;
        this.progressEl.style.display = 'none';
      }
    } else {
      this.promptEl.style.display = 'none';
      this.progressEl.style.display = 'none';
      this.slowMs = 0;
    }
  }

  dispose(): void {
    this.promptEl.remove();
    this.progressEl.remove();
  }

  private triggerStop(car: Car): void {
    this.done = true;
    this.promptEl.style.display = 'none';
    this.progressEl.style.display = 'none';
    car.repairTyre();
    narrate('faithspen.stop');
    showBoostFlash();
  }

  private buildStalls(road: Road): void {
    const pts = road.points;

    // Direction of travel at Faith's Pen — used to orient and offset stalls
    let nearIdx = 0;
    let nearDistSq = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = pts[i].distanceToSquared(this.center);
      if (d < nearDistSq) { nearDistSq = d; nearIdx = i; }
    }
    const prev = pts[Math.max(0, nearIdx - 1)];
    const next = pts[Math.min(pts.length - 1, nearIdx + 1)];
    const dir = next.clone().sub(prev).normalize();

    // Left verge in left-hand traffic: perp = (-dir.z, 0, dir.x)
    // Road centre + perp*ROAD_WIDTH/2 = left edge; stalls go just beyond that.
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const vergeOffset = 7; // m left of road centre

    const stallMat = new THREE.MeshLambertMaterial({ color: 0x7b5c3e, flatShading: true });
    const roofMat  = new THREE.MeshLambertMaterial({ color: 0xd42b2b, flatShading: true });
    const grillMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const fireMat  = new THREE.MeshLambertMaterial({
      color: 0xff6a00,
      emissive: new THREE.Color(0xff3300),
      emissiveIntensity: 0.5,
    });
    const signMat  = new THREE.MeshLambertMaterial({ color: 0xfed100, flatShading: true });

    // Three stalls spaced 7 m apart along the road
    for (let s = 0; s < 3; s++) {
      const along = (s - 1) * 7; // -7, 0, +7 m relative to landmark centre
      const bx = this.center.x + perp.x * vergeOffset + dir.x * along;
      const bz = this.center.z + perp.z * vergeOffset + dir.z * along;

      // Stall body (wooden-coloured box)
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2.6), stallMat);
      body.position.set(bx, 1.1, bz);

      // Overhanging roof (red tin, extends toward road)
      const roofW = 4.8;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.15, 3.4), roofMat);
      const frontOffset = perp.clone().multiplyScalar(-0.8); // lean toward road
      roof.position.set(bx + frontOffset.x, 2.3, bz + frontOffset.z);

      this.object.add(body, roof);

      // Charcoal grills at the two end stalls (road-facing side)
      if (s !== 1) {
        const frontX = bx - perp.x * 2.0;
        const frontZ = bz - perp.z * 2.0;
        const grill = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.3), grillMat);
        grill.position.set(frontX, 0.35, frontZ);
        const fire = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 1.05), fireMat);
        fire.position.set(frontX, 0.61, frontZ);
        this.object.add(grill, fire);
      }
    }

    // Roadside sign: "FAITH'S PEN" in Jamaican gold, facing the road
    // Perpendicular to dir, road-side face of the stalls
    const signX = this.center.x + perp.x * (vergeOffset - 2.5);
    const signZ = this.center.z + perp.z * (vergeOffset - 2.5);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.0, 0.12), stallMat);
    post.position.set(signX, 1.5, signZ);
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.95, 0.14), signMat);
    signBoard.position.set(signX, 3.1, signZ);
    // Rotate sign to face traffic (perpendicular to road)
    const signAngle = Math.atan2(dir.x, dir.z);
    signBoard.rotation.y = signAngle;
    post.rotation.y = signAngle;
    this.object.add(post, signBoard);
  }
}

// --- HUD helpers -----------------------------------------------------------

function createPromptEl(): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', bottom: '84px', left: '50%',
    transform: 'translateX(-50%)',
    padding: '9px 22px', borderRadius: '10px',
    background: '#fed100', color: '#1a1a00',
    fontFamily: 'system-ui, sans-serif', fontWeight: '800',
    fontSize: '17px', display: 'none', userSelect: 'none',
    border: '3px solid #007749', whiteSpace: 'nowrap',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  el.textContent = '\u{1F357} Faith’s Pen — Slow down fi jerk chicken!';
  document.body.appendChild(el);
  return el;
}

function createProgressEl(): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', bottom: '128px', left: '50%',
    transform: 'translateX(-50%)',
    padding: '5px 18px', borderRadius: '8px',
    background: '#007749', color: '#fed100',
    fontFamily: 'system-ui, monospace', fontWeight: '700',
    fontSize: '14px', display: 'none', userSelect: 'none',
    whiteSpace: 'nowrap', pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  return el;
}

function showBoostFlash(): void {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '16px 36px', borderRadius: '14px',
    background: '#007749', color: '#fed100',
    fontFamily: 'system-ui, sans-serif', fontWeight: '900',
    fontSize: '26px', userSelect: 'none', pointerEvents: 'none',
    opacity: '1', transition: 'opacity 0.6s',
    zIndex: '999',
  } satisfies Partial<CSSStyleDeclaration>);
  el.textContent = '\u{1F357} Nyam done! Tyre fix up! \u{1F1EF}\u{1F1F2}';
  document.body.appendChild(el);
  // Fade and remove
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 700);
    }, 1800);
  });
}
