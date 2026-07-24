import * as THREE from 'three';
import type { Road } from './road';
import type { Car } from './car';
import { narrate } from './narrator';

// How close to the last route point before the finale fires (compressed-world metres).
const TRIGGER_RADIUS = 350;

// Dunn's River Falls bath finale — V1 cinematic ending.
// No on-foot gameplay (see GAME_SPEC); the sequence is a full-screen overlay.
// Fires once when the player reaches the terminal end of the route.
export class Finale {
  private triggered = false;
  private readonly endPoint: THREE.Vector3;

  constructor(road: Road, private readonly car: Car) {
    this.endPoint = road.points[road.points.length - 1].clone();
  }

  // Call every frame. Returns true once the finale has been triggered.
  update(): boolean {
    if (this.triggered) return true;
    if (this.car.position.distanceTo(this.endPoint) > TRIGGER_RADIUS) return false;
    this.triggered = true;
    this.car.lock();
    narrate('game.finale');
    showFinaleOverlay(this.car);
    return true;
  }
}

function showFinaleOverlay(car: Car): void {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(135,206,235,0)', // starts transparent (sky blue → white spray)
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    zIndex: '200', fontFamily: 'system-ui, sans-serif',
    textAlign: 'center', transition: 'background 1.8s ease',
    pointerEvents: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(overlay);

  // Phase 1: fade to waterfall-spray white
  requestAnimationFrame(() => {
    overlay.style.background = 'rgba(255,255,255,0.95)';
  });

  // Phase 2: reveal the finale card once fade is done
  setTimeout(() => showCard(overlay, car), 1900);
}

function showCard(overlay: HTMLDivElement, car: Car): void {
  const tyreWord = car.tyresBurstCount === 1 ? 'tyre' : 'tyres';
  const topSpeed = Math.round(car.topSpeedKmh);
  const burstLine = car.tyresBurstCount === 0
    ? '✅ Zero tyres burst — yuh drive clean!'
    : `💥 ${car.tyresBurstCount} ${tyreWord} burst along di way`;

  overlay.innerHTML = `
    <div style="
      max-width:460px; width:90%; background:#005f60; border-radius:20px;
      padding:32px 28px; box-shadow:0 8px 32px rgba(0,0,95,0.25);
      animation:dj-drop .5s cubic-bezier(.22,1,.36,1)
    ">
      <div style="font-size:72px;line-height:1;margin-bottom:4px">💦</div>
      <h1 style="
        color:#fed100; font-size:1.8rem; margin:8px 0 4px;
        text-shadow:0 2px 6px rgba(0,0,0,.4)
      ">Dunn's River Falls!</h1>
      <p style="color:#b2f0f0;font-size:1.05rem;margin:0 0 22px">
        Yuh make di full run, brethren. Time fi cool off!
      </p>

      <div style="
        background:rgba(255,255,255,.12); border-radius:12px;
        padding:14px 18px; margin-bottom:22px;
        color:#fff; font-size:.95rem; line-height:1.9; text-align:left
      ">
        <div>🏁 <b>Norman Manley Airport → Ocho Rios</b></div>
        <div>${burstLine}</div>
        <div>🚗 Top speed: <b>${topSpeed} km/h</b></div>
      </div>

      <button id="dj-play-again" style="
        padding:14px 40px; background:#fed100; color:#1a1a1a;
        border:none; border-radius:10px; font-size:1.1rem;
        font-weight:800; cursor:pointer; letter-spacing:.04em;
        box-shadow:0 4px 12px rgba(0,0,0,.25);
        transition:transform .1s,box-shadow .1s
      ">Drive Again 🇯🇲</button>
    </div>
    <style>
      @keyframes dj-drop {
        from { transform:translateY(-30px); opacity:0 }
        to   { transform:translateY(0);     opacity:1 }
      }
      #dj-play-again:hover  { transform:scale(1.04); box-shadow:0 6px 18px rgba(0,0,0,.3) }
      #dj-play-again:active { transform:scale(.97) }
    </style>`;

  document.getElementById('dj-play-again')
    ?.addEventListener('click', () => location.reload());
}
