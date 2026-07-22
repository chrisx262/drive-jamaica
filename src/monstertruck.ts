import * as THREE from 'three';
import type { Car } from './car';
import type { InputState } from './input';
import { narrate } from './narrator';

// Monster Truck transformation — GAME_SPEC V1 mechanic.
// The frustration meter fills when the player is stuck behind Kingston traffic.
// When full, Space activates monster truck mode: bigger mesh, crushes NPC cars,
// auto-reverts after ACTIVE_DURATION seconds. Car physics are never touched.

const ACTIVE_DURATION = 8; // seconds of monster truck mode per activation

export class MonsterTruck {
  private meter = 0;        // 0..1 frustration level
  private active = false;
  private timer = 0;
  private readonly truckMesh: THREE.Group;
  private readonly meterEl: HTMLElement;
  private readonly meterFill: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private wasFullLast = false;

  constructor(private readonly car: Car, scene: THREE.Scene) {
    this.truckMesh = makeMonsterTruckMesh();
    this.truckMesh.visible = false;
    scene.add(this.truckMesh);

    injectKeyframeCSS();
    this.meterEl = document.createElement('div');
    this.meterFill = document.createElement('div');
    this.promptEl = document.createElement('div');
    this.timerEl = document.createElement('div');
    this.buildHUD();
  }

  get isActive(): boolean { return this.active; }

  update(dt: number, frustrationDelta: number, input: InputState): void {
    if (this.active) {
      this.timer -= dt;
      this.truckMesh.position.copy(this.car.position);
      this.truckMesh.rotation.y = this.car.heading;
      const secs = Math.ceil(Math.max(0, this.timer));
      this.timerEl.textContent = `🚛  ${secs}s`;

      if (this.timer <= 0) this.deactivate();
      return;
    }

    // Update frustration meter
    this.meter = THREE.MathUtils.clamp(this.meter + frustrationDelta * dt, 0, 1);
    this.syncMeterHUD();

    const isFull = this.meter >= 1.0;
    if (isFull && !this.wasFullLast) {
      this.promptEl.style.opacity = '1';
      narrate('traffic.meter_full');
    }
    if (!isFull && this.wasFullLast) {
      this.promptEl.style.opacity = '0';
    }
    this.wasFullLast = isFull;

    if (isFull && input.action) this.activate();
  }

  private activate(): void {
    this.active = true;
    this.timer = ACTIVE_DURATION;
    this.meter = 0;
    this.car.object.visible = false;
    this.truckMesh.visible = true;
    this.truckMesh.position.copy(this.car.position);
    this.truckMesh.rotation.y = this.car.heading;
    this.meterEl.style.opacity = '0';
    this.promptEl.style.opacity = '0';
    this.timerEl.style.opacity = '1';
    narrate('monster.transform');
  }

  private deactivate(): void {
    this.active = false;
    this.car.object.visible = true;
    this.truckMesh.visible = false;
    this.timerEl.style.opacity = '0';
    narrate('monster.revert');
  }

  private syncMeterHUD(): void {
    if (this.meter < 0.02) {
      this.meterEl.style.opacity = '0';
      return;
    }
    this.meterEl.style.opacity = '1';
    this.meterFill.style.width = `${this.meter * 100}%`;
    const pulse = this.meter >= 1.0;
    this.meterEl.style.animationName = pulse ? 'dj-meter-pulse' : 'none';
  }

  private buildHUD(): void {
    // Frustration bar — bottom-center, appears once traffic is near
    Object.assign(this.meterEl.style, {
      position: 'fixed', bottom: '96px', left: '50%',
      transform: 'translateX(-50%)',
      width: '190px', opacity: '0',
      transition: 'opacity 0.4s',
      userSelect: 'none',
      animationDuration: '0.4s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDirection: 'alternate',
    } satisfies Partial<CSSStyleDeclaration>);

    const label = document.createElement('div');
    Object.assign(label.style, {
      textAlign: 'center', fontFamily: 'system-ui, sans-serif',
      fontSize: '10px', fontWeight: '700', color: '#fed100',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)', letterSpacing: '1px',
      marginBottom: '3px',
    } satisfies Partial<CSSStyleDeclaration>);
    label.textContent = '😤 FRUSTRATION';

    const track = document.createElement('div');
    Object.assign(track.style, {
      height: '8px', background: 'rgba(0,0,0,0.55)',
      borderRadius: '4px', overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.meterFill.style, {
      height: '100%', width: '0%',
      background: 'linear-gradient(90deg,#f39c12,#e74c3c)',
      borderRadius: '4px', transition: 'width 0.15s',
    } satisfies Partial<CSSStyleDeclaration>);
    track.appendChild(this.meterFill);
    this.meterEl.append(label, track);
    document.body.appendChild(this.meterEl);

    // "SPACE — BIG TRUCK TING!" prompt — appears when meter is full
    Object.assign(this.promptEl.style, {
      position: 'fixed', bottom: '60px', left: '50%',
      transform: 'translateX(-50%)',
      padding: '7px 18px', borderRadius: '8px',
      background: 'linear-gradient(135deg,#e74c3c,#f39c12)',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
      fontWeight: '900', fontSize: '16px', letterSpacing: '1px',
      opacity: '0', transition: 'opacity 0.3s',
      userSelect: 'none', textAlign: 'center',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    this.promptEl.textContent = '🚛  SPACE — BIG TRUCK TING!';
    document.body.appendChild(this.promptEl);

    // Countdown timer — visible during monster truck mode
    Object.assign(this.timerEl.style, {
      position: 'fixed', top: '12px', right: '12px',
      color: '#fed100', fontFamily: 'system-ui, sans-serif',
      fontWeight: '900', fontSize: '22px',
      textShadow: '0 1px 4px rgba(0,0,0,0.7)',
      opacity: '0', transition: 'opacity 0.3s',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.timerEl);
  }
}

function makeMonsterTruckMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.95, 5.6),
    new THREE.MeshLambertMaterial({ color: 0x1a4d2e }),
  );
  body.position.y = 1.55;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.9, 2.6),
    new THREE.MeshLambertMaterial({ color: 0x0d2e1a }),
  );
  cabin.position.set(0, 2.5, 0.1);
  g.add(body, cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.58, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [x, z] of [[-1.45, -1.9], [1.45, -1.9], [-1.45, 1.9], [1.45, 1.9]] as [number, number][]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.78, z);
    g.add(w);
  }
  return g;
}

function injectKeyframeCSS(): void {
  const s = document.createElement('style');
  s.textContent = `@keyframes dj-meter-pulse{from{transform:translateX(-50%) scale(1);}to{transform:translateX(-50%) scale(1.07);}}`;
  document.head.appendChild(s);
}
