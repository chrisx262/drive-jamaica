// On-screen touch controls for mobile. Injects a transparent overlay and maps
// tap zones to the same InputState the keyboard uses — zero changes to car physics.
//
// Layout (bottom 38% of screen):
//   [ ◀ LEFT ] [ BRAKE ] [ RIGHT ▶ ]
//
// Auto-accelerate: on touch devices the car always moves forward; the player
// steers and brakes only. Pressing brake clears accelerate; releasing restores it.

import type { InputState } from './input';

export function initTouch(state: InputState): void {
  if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return;

  const style = document.createElement('style');
  style.textContent = `
    #touch-overlay {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: 38%;
      display: flex;
      align-items: stretch;
      z-index: 50;
    }
    .touch-zone {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.15);
      border-top: 2px solid rgba(255,255,255,0.12);
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .touch-zone.active { background: rgba(255,255,255,0.22); }
    .touch-icon {
      font-size: clamp(28px, 7vw, 52px);
      color: rgba(255,255,255,0.65);
      font-weight: 900;
      text-shadow: 0 2px 8px rgba(0,0,0,0.5);
      pointer-events: none;
    }
    #touch-brake {
      flex: 0.65;
      background: rgba(180,20,20,0.18);
      border-top-color: rgba(255,80,80,0.25);
    }
    #touch-brake .touch-icon {
      font-size: clamp(14px, 3.5vw, 26px);
      letter-spacing: 0.05em;
    }
    #touch-brake.active { background: rgba(200,30,30,0.42); }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'touch-overlay';
  overlay.innerHTML = `
    <div id="touch-left"  class="touch-zone"><span class="touch-icon">◀</span></div>
    <div id="touch-brake" class="touch-zone"><span class="touch-icon">BRAKE</span></div>
    <div id="touch-right" class="touch-zone"><span class="touch-icon">▶</span></div>
  `;
  document.body.appendChild(overlay);

  const leftEl  = document.getElementById('touch-left')!;
  const rightEl = document.getElementById('touch-right')!;
  const brakeEl = document.getElementById('touch-brake')!;

  const leftPtrs  = new Set<number>();
  const rightPtrs = new Set<number>();
  const brakePtrs = new Set<number>();

  function bindZone(
    el: HTMLElement,
    ptrs: Set<number>,
    onDown: () => void,
    onUp: () => void,
  ): void {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      ptrs.add(e.pointerId);
      el.setPointerCapture(e.pointerId);
      onDown();
      el.classList.add('active');
    });
    const release = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) {
        onUp();
        el.classList.remove('active');
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  // Auto-accelerate: the car moves forward as soon as the page loads on mobile.
  state.accelerate = true;

  bindZone(leftEl,  leftPtrs,
    () => { state.left = true; },
    () => { state.left = false; });

  bindZone(rightEl, rightPtrs,
    () => { state.right = true; },
    () => { state.right = false; });

  bindZone(brakeEl, brakePtrs,
    () => { state.brake = true; state.accelerate = false; },
    () => { state.brake = false; state.accelerate = true; });
}
