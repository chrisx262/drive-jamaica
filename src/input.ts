// Keyboard state, polled by the game loop. Arrows + WASD + H/Space for honk/transform.
export interface InputState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  honk: boolean;
}

const state: InputState = { accelerate: false, brake: false, left: false, right: false, honk: false };

const KEYMAP: Record<string, keyof InputState> = {
  ArrowUp: 'accelerate', KeyW: 'accelerate',
  ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyH: 'honk', Space: 'honk',
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
