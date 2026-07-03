import narratorData from '../data/narrator.json';

// Data-driven narrator (standing rule: lines live in data/narrator.json, never in code).
// Captions are always shown. Audio sprites play when loaded — see loadNarratorAudio().
const events: Record<string, string[]> = narratorData.events;

let captionEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

// Audio sprite state — populated by loadNarratorAudio() after first user interaction.
let audioCtx: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let spriteMap: Record<string, [number, number]> = {};

export function initNarrator(): void {
  captionEl = document.createElement('div');
  Object.assign(captionEl.style, {
    position: 'fixed', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
    padding: '8px 20px', borderRadius: '8px', background: 'rgba(0,0,0,0.75)',
    color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '700',
    fontSize: '20px', opacity: '0', transition: 'opacity 0.25s', userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(captionEl);
}

// Load narrator audio sprites from a JSON manifest + MP3 sprite file.
// Call after the first user interaction (browser autoplay policy).
// If the manifest is missing or sprites is empty it returns silently;
// caption-only mode remains active until recordings are available.
export async function loadNarratorAudio(manifestPath: string): Promise<void> {
  if (audioCtx) return; // already loaded
  try {
    const res = await fetch(manifestPath);
    if (!res.ok) return;
    const manifest = await res.json() as {
      spriteFile?: string;
      sprites?: Record<string, [number, number]>;
    };
    if (!manifest.spriteFile || !manifest.sprites || !Object.keys(manifest.sprites).length) return;
    const mp3Res = await fetch(manifest.spriteFile);
    if (!mp3Res.ok) return;
    audioCtx = new AudioContext();
    audioBuffer = await audioCtx.decodeAudioData(await mp3Res.arrayBuffer());
    spriteMap = manifest.sprites;
  } catch {
    // Audio unavailable — caption-only mode continues transparently.
  }
}

function playSprite(key: string): void {
  if (!audioCtx || !audioBuffer) return;
  const entry = spriteMap[key];
  if (!entry) return;
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start(audioCtx.currentTime, entry[0], entry[1]);
}

export function narrate(event: string, vars: Record<string, string> = {}): void {
  const lines = events[event];
  if (!lines?.length || !captionEl) return;
  const idx = Math.floor(Math.random() * lines.length);
  let line = lines[idx];
  for (const [k, v] of Object.entries(vars)) line = line.replaceAll(`{${k}}`, v);
  captionEl.textContent = `\u{1F399} ${line}`;
  captionEl.style.opacity = '1';
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (captionEl) captionEl.style.opacity = '0'; }, 3500);
  playSprite(`${event}.${idx}`);
}
