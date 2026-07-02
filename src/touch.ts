import type { InputState } from './input';

// On-screen virtual controls for touch devices.
// Steering (← →) on the left, gas (▲) + brake (▼) on the right.
// Wires into the same InputState as the keyboard — car.ts sees no difference.
export function initTouch(state: InputState): void {
  if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '100',
    pointerEvents: 'none', userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(overlay);

  const BTN  = 84;  // steering button size (px)
  const GAS  = 104; // gas button size
  const BRK  = 64;  // brake button height
  const PAD  = 20;  // edge padding
  const GAP  = 10;  // gap between buttons

  addBtn(overlay, '←', {
    left: `${PAD}px`, bottom: `${PAD}px`,
    width: `${BTN}px`, height: `${BTN}px`,
  }, () => { state.left = true; }, () => { state.left = false; });

  addBtn(overlay, '→', {
    left: `${PAD + BTN + GAP}px`, bottom: `${PAD}px`,
    width: `${BTN}px`, height: `${BTN}px`,
  }, () => { state.right = true; }, () => { state.right = false; });

  addBtn(overlay, '▲', {
    right: `${PAD}px`, bottom: `${PAD}px`,
    width: `${GAS}px`, height: `${GAS}px`,
    fontSize: '38px',
  }, () => { state.accelerate = true; }, () => { state.accelerate = false; });

  addBtn(overlay, '▼', {
    right: `${PAD}px`, bottom: `${PAD + GAS + GAP}px`,
    width: `${GAS}px`, height: `${BRK}px`,
  }, () => { state.brake = true; }, () => { state.brake = false; });
}

function addBtn(
  parent: HTMLElement,
  label: string,
  extraStyles: Partial<CSSStyleDeclaration>,
  onDown: () => void,
  onUp: () => void,
): void {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.12)',
    border: '2px solid rgba(255,255,255,0.28)',
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '28px',
    fontWeight: '700',
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(el.style, extraStyles);
  el.textContent = label;

  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onDown();
    el.style.background = 'rgba(255,255,255,0.30)';
  }, { passive: false });

  const release = () => {
    onUp();
    el.style.background = 'rgba(255,255,255,0.12)';
  };
  el.addEventListener('touchend', release);
  el.addEventListener('touchcancel', release);

  parent.appendChild(el);
}
