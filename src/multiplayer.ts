import * as THREE from 'three';
import type { Car } from './car';
import { narrate } from './narrator';

const SEND_INTERVAL = 100; // ms ≈ 10 Hz
const INTERP_FACTOR = 8;   // lerp speed toward received position (per second)

const GHOST_COLORS = [
  0x00c8c8, 0xff8c00, 0xe040fb, 0x4caf50,
  0xf44336, 0x2196f3, 0xffeb3b, 0xff4081,
] as const;

interface PeerState {
  id: string;
  nickname: string;
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface ServerMessage {
  type: string;
  id?: string;
  peers?: PeerState[];
  from?: string;
  kind?: string;
}

interface PeerGhost {
  object: THREE.Group;
  labelEl: HTMLElement;
  nickname: string;
  target: THREE.Vector3;
  targetHeading: number;
}

function buildGhostCar(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 4.2),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.5;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x444c55 }),
  );
  cabin.position.set(0, 1.0, 0.1);
  g.add(body, cabin);
  return g;
}

export class Multiplayer {
  private ws: WebSocket | null = null;
  private myId: string | null = null;
  private nickname: string;
  private readonly peers = new Map<string, PeerGhost>();
  private colorIndex = 0;
  private sendAccum = 0;
  private connected = false;
  private readonly labelContainer: HTMLElement;
  private readonly tmpVec = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly car: Car,
    wsUrl: string | undefined,
  ) {
    this.nickname = sessionStorage.getItem('dj_nickname') ?? '';

    this.labelContainer = document.createElement('div');
    Object.assign(this.labelContainer.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.labelContainer);

    if (!wsUrl) return;

    if (this.nickname) {
      this.connectWs(wsUrl);
    } else {
      this.showNicknamePrompt(wsUrl);
    }

    // H key = horn honk emote (separate from driving keys in input.ts)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'KeyH') this.honk();
    });
  }

  private showNicknamePrompt(wsUrl: string): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', zIndex: '100',
    } satisfies Partial<CSSStyleDeclaration>);

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#007749', color: '#fff',
      padding: '24px 28px', borderRadius: '12px',
      border: '3px solid #fed100',
      fontFamily: 'system-ui, sans-serif', textAlign: 'center',
      minWidth: '280px',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('p');
    title.style.cssText = 'margin:0 0 6px;font-weight:800;font-size:18px';
    title.textContent = '🇯🇲 Drive Jamaica';

    const sub = document.createElement('p');
    sub.style.cssText = 'margin:0 0 14px;font-size:13px;opacity:.85';
    sub.textContent = 'Name shown to other players on the road';

    const input = document.createElement('input');
    Object.assign(input.style, {
      width: '100%', boxSizing: 'border-box',
      padding: '8px 10px', borderRadius: '6px',
      border: 'none', fontSize: '16px', marginBottom: '12px',
      fontFamily: 'system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    input.placeholder = 'Your nickname';
    input.maxLength = 16;
    input.setAttribute('autocomplete', 'off');

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px';

    const joinBtn = document.createElement('button');
    Object.assign(joinBtn.style, {
      flex: '1', padding: '9px', borderRadius: '6px',
      background: '#fed100', color: '#111', border: 'none',
      fontWeight: '800', fontSize: '15px', cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    joinBtn.textContent = 'Join Road';

    const soloBtn = document.createElement('button');
    Object.assign(soloBtn.style, {
      padding: '9px 16px', borderRadius: '6px',
      background: 'transparent', color: '#ccc',
      border: '1px solid #555', fontSize: '13px', cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    soloBtn.textContent = 'Solo';

    btnRow.append(joinBtn, soloBtn);
    box.append(title, sub, input, btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const dismiss = (nick: string): void => {
      overlay.remove();
      this.nickname = nick;
      if (nick && nick !== 'Anonymous') sessionStorage.setItem('dj_nickname', nick);
      this.connectWs(wsUrl);
    };

    joinBtn.onclick = () => dismiss(input.value.trim() || 'Anonymous');
    soloBtn.onclick = () => dismiss('Anonymous');
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') dismiss(input.value.trim() || 'Anonymous');
    });

    // Give canvas time to steal focus first, then focus the input
    setTimeout(() => input.focus(), 200);
  }

  private connectWs(url: string): void {
    try {
      this.ws = new WebSocket(url);
    } catch {
      return; // bad URL — fail silently, game runs solo
    }

    this.ws.onopen = () => { this.connected = true; };
    this.ws.onclose = () => { this.connected = false; };
    this.ws.onerror = () => { this.connected = false; };

    this.ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(ev.data) as ServerMessage; } catch { return; }

      if (msg.type === 'hello' && msg.id) {
        this.myId = msg.id;
      } else if (msg.type === 'peers' && msg.peers) {
        this.reconcilePeers(msg.peers);
      } else if (msg.type === 'emote' && msg.from && msg.from !== this.myId && msg.kind) {
        const ghost = this.peers.get(msg.from);
        if (ghost) this.flashEmote(ghost, msg.kind);
      }
    };
  }

  private reconcilePeers(states: PeerState[]): void {
    const seen = new Set<string>();
    for (const s of states) {
      if (s.id === this.myId) continue;
      seen.add(s.id);
      let ghost = this.peers.get(s.id);
      if (!ghost) {
        ghost = this.addGhost(s.id, s.nickname);
        narrate('player.join', { nickname: s.nickname || 'Someone' });
      }
      ghost.target.set(s.x, s.y, s.z);
      ghost.targetHeading = s.heading;
      if (ghost.nickname !== s.nickname) {
        ghost.nickname = s.nickname;
        ghost.labelEl.textContent = s.nickname || 'anon';
      }
    }
    for (const [id, ghost] of this.peers) {
      if (!seen.has(id)) {
        this.scene.remove(ghost.object);
        ghost.labelEl.remove();
        this.peers.delete(id);
      }
    }
  }

  private addGhost(id: string, nickname: string): PeerGhost {
    const color = GHOST_COLORS[this.colorIndex % GHOST_COLORS.length];
    this.colorIndex++;
    const object = buildGhostCar(color);
    // Start ghost at the same spot as our car so it doesn't flash in from origin
    object.position.copy(this.car.position);
    this.scene.add(object);

    const labelEl = document.createElement('div');
    Object.assign(labelEl.style, {
      position: 'absolute', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.65)', color: '#fff',
      fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontWeight: '700',
      padding: '2px 7px', borderRadius: '3px', whiteSpace: 'nowrap',
      pointerEvents: 'none', display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    labelEl.textContent = nickname || 'anon';
    this.labelContainer.appendChild(labelEl);

    const ghost: PeerGhost = {
      object, labelEl, nickname,
      target: this.car.position.clone(),
      targetHeading: 0,
    };
    this.peers.set(id, ghost);
    return ghost;
  }

  private flashEmote(ghost: PeerGhost, kind: string): void {
    ghost.labelEl.textContent = kind === 'honk' ? '📯' : '👋';
    setTimeout(() => { ghost.labelEl.textContent = ghost.nickname || 'anon'; }, 2000);
  }

  honk(): void {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'emote', kind: 'honk' }));
  }

  update(dt: number, camera: THREE.Camera): void {
    // Send our position at ~10 Hz
    this.sendAccum += dt * 1000;
    if (this.connected && this.ws && this.sendAccum >= SEND_INTERVAL) {
      this.sendAccum -= SEND_INTERVAL;
      const { x, y, z } = this.car.position;
      this.ws.send(JSON.stringify({
        type: 'pos',
        x, y, z,
        heading: this.car.heading,
        nickname: this.nickname,
      }));
    }

    // Interpolate ghost cars toward their latest received position
    const factor = Math.min(INTERP_FACTOR * dt, 1);
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const ghost of this.peers.values()) {
      ghost.object.position.lerp(ghost.target, factor);
      ghost.object.rotation.y = THREE.MathUtils.lerp(
        ghost.object.rotation.y, ghost.targetHeading, factor,
      );

      // Project the roof point to screen coords for the floating name label
      this.tmpVec.copy(ghost.object.position).y += 2.5;
      this.tmpVec.project(camera);
      const sx = (this.tmpVec.x * 0.5 + 0.5) * w;
      const sy = (-this.tmpVec.y * 0.5 + 0.5) * h;
      const visible = this.tmpVec.z < 1 && sx > 0 && sx < w && sy > 0 && sy < h;
      ghost.labelEl.style.display = visible ? 'block' : 'none';
      if (visible) {
        ghost.labelEl.style.left = `${sx}px`;
        ghost.labelEl.style.top = `${sy}px`;
      }
    }
  }

  dispose(): void {
    this.ws?.close();
    for (const ghost of this.peers.values()) {
      this.scene.remove(ghost.object);
      ghost.labelEl.remove();
    }
    this.labelContainer.remove();
  }
}
