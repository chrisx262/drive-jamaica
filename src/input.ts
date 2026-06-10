// Keyboard state, polled by the game loop. Arrows + WASD.
export interface InputState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

const state: InputState = { accelerate: false, brake: false, left: false, right: false };

const KEYMAP: Record<string, keyof InputState> = {
  ArrowUp: 'accelerate', KeyW: 'accelerate',
  ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function initInput(): InputState {
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) { state[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) state[k] = false;
  });
  return state;
}
