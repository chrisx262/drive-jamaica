import * as THREE from 'three';
import type { Car } from './car';
import { narrate } from './narrator';

type UpgradeType = 'exhaust' | 'rims' | 'engine' | 'sound';

// Points earned per second while moving. Thresholds [L1, L2, L3] per slot.
// Pacing: first upgrade ~25s in; fully maxed ~5 min → halfway through the run.
const EARN_RATE = 1; // pts / sec
const THRESHOLDS: Record<UpgradeType, [number, number, number]> = {
  exhaust: [ 25,  80, 180],
  rims:    [ 40, 110, 220],
  sound:   [ 55, 140, 260],
  engine:  [ 70, 170, 300],
};

// Rim overlay colours: L1 = silver, L2 = gold, L3 = red chrome
const RIM_COLORS = [0xc0c0c0, 0xffd700, 0xbb1100] as const;
// Exhaust smoke colours: L1 = light, L2 = grey, L3 = dark
const SMOKE_COLORS = [0xd8d8d8, 0x888888, 0x2e2e2e] as const;

const MAX_PARTICLES = 40;

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
}

// Vehicle upgrade system: visual/audio mods earned passively while driving.
// Four slots (exhaust, rims, engine, sound), each with three levels.
// No physics constants are touched — feel is tuned by the owner in car.ts.
export class UpgradeSystem {
  private pts = 0;
  private levels: Record<UpgradeType, number> = { exhaust: 0, rims: 0, engine: 0, sound: 0 };
  private rimMeshes: THREE.Mesh[] = [];
  private exhaustGroup: THREE.Group;
  private particles: Particle[] = [];
  private readonly pGeo: THREE.SphereGeometry;
  private bassPhase = 0;
  private hudEl: HTMLElement;
  private bassEl: HTMLElement;

  constructor(private readonly car: Car, scene: THREE.Scene) {
    this.pGeo = new THREE.SphereGeometry(0.15, 5, 4);
    this.exhaustGroup = new THREE.Group();
    scene.add(this.exhaustGroup);
    this.buildRimOverlays();
    this.hudEl = this.buildHudEl();
    this.bassEl = this.buildBassEl();
  }

  // Wheel-cap rim overlays: children of car.object so they move with it.
  // Wheel positions mirror car.ts constructor — update both if geometry changes.
  private buildRimOverlays(): void {
    const geo = new THREE.CylinderGeometry(0.27, 0.27, 0.06, 14);
    geo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) {
      const mat = new THREE.MeshLambertMaterial({ color: RIM_COLORS[0] });
      const rim = new THREE.Mesh(geo, mat);
      rim.position.set(wx as number, 0.32, wz as number);
      rim.visible = false;
      this.car.object.add(rim);
      this.rimMeshes.push(rim);
    }
  }

  private buildHudEl(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '40px', left: '12px',
      fontFamily: 'system-ui, sans-serif', fontSize: '13px',
      color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.65)',
      userSelect: 'none', letterSpacing: '1px',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    return el;
  }

  private buildBassEl(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', bottom: '12px', left: '12px',
      fontFamily: 'system-ui, sans-serif', fontSize: '12px',
      color: '#fed100', textShadow: '0 1px 2px rgba(0,0,0,.7)',
      userSelect: 'none', opacity: '0',
      transition: 'opacity 0.15s, transform 0.1s',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    return el;
  }

  update(dt: number): void {
    if (this.car.speed > 0.5) this.pts += EARN_RATE * dt;
    this.checkUpgrades();
    this.tickExhaust(dt);
    this.tickBass(dt);
    this.refreshHud();
  }

  private checkUpgrades(): void {
    for (const type of Object.keys(THRESHOLDS) as UpgradeType[]) {
      const thresh = THRESHOLDS[type];
      while (this.levels[type] < 3 && this.pts >= thresh[this.levels[type]]) {
        this.levels[type]++;
        this.applyUpgrade(type);
        narrate(`upgrade.${type}`);
      }
    }
  }

  private applyUpgrade(type: UpgradeType): void {
    if (type === 'rims') {
      const col = RIM_COLORS[this.levels.rims - 1];
      for (const rim of this.rimMeshes) {
        rim.visible = true;
        (rim.material as THREE.MeshLambertMaterial).color.setHex(col);
      }
    }
    // exhaust: emission handled in tickExhaust as soon as level > 0
    // engine:  narrator shout + HUD badge — no physics touched (owner tunes car.ts)
    // sound:   bass animation handled in tickBass
  }

  private tickExhaust(dt: number): void {
    const lvl = this.levels.exhaust;
    if (lvl > 0 && this.particles.length < MAX_PARTICLES && this.car.speed > 0.5) {
      const rate = lvl === 1 ? 6 : lvl === 2 ? 14 : 24; // particles / sec
      const count = Math.round(rate * dt + Math.random() * 0.5);
      for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
        this.spawnParticle(lvl);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.exhaustGroup.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.age / p.maxAge;
      p.mesh.scale.setScalar(THREE.MathUtils.lerp(0.9, 0.2, t));
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = THREE.MathUtils.lerp(0.65, 0, t);
    }
  }

  private spawnParticle(level: number): void {
    const col = SMOKE_COLORS[level - 1];
    const mat = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.65 });
    const mesh = new THREE.Mesh(this.pGeo, mat);

    // Rear of car in world space: heading points forward, so +sin/+cos is behind
    const rear = this.car.position.clone();
    rear.x += Math.sin(this.car.heading) * 2.3;
    rear.z += Math.cos(this.car.heading) * 2.3;
    rear.y += 0.28 + Math.random() * 0.15;
    mesh.position.copy(rear);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      0.6 + Math.random() * 0.8,
      (Math.random() - 0.5) * 0.4,
    );
    this.particles.push({ mesh, vel, age: 0, maxAge: 0.7 + Math.random() * 0.7 });
    this.exhaustGroup.add(mesh);
  }

  private tickBass(dt: number): void {
    const lvl = this.levels.sound;
    if (lvl === 0) {
      this.bassEl.style.opacity = '0';
      return;
    }
    this.bassPhase += dt;
    const period = lvl === 1 ? 2.0 : lvl === 2 ? 1.4 : 0.95;
    const pulse = (this.bassPhase % period) < 0.12;
    const bars = '▮'.repeat(lvl) + '▯'.repeat(3 - lvl);
    this.bassEl.textContent = `🎵 ${bars}`;
    this.bassEl.style.opacity = pulse ? '1' : '0.5';
    this.bassEl.style.transform = pulse && lvl >= 3 ? 'scale(1.12)' : 'scale(1)';
  }

  private refreshHud(): void {
    const dot = (n: number) => '●'.repeat(n) + '○'.repeat(3 - n);
    const parts: string[] = [];
    if (this.levels.exhaust) parts.push(`💨${dot(this.levels.exhaust)}`);
    if (this.levels.rims)    parts.push(`🔘${dot(this.levels.rims)}`);
    if (this.levels.engine)  parts.push(`⚡${dot(this.levels.engine)}`);
    if (this.levels.sound)   parts.push(`🎵${dot(this.levels.sound)}`);
    this.hudEl.textContent = parts.join('  ');
  }
}
