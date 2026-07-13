import narratorData from '../data/narrator.json';

// Data-driven narrator (standing rule: lines live in data/narrator.json, never in code).
// V1 scaffold renders captions only; audio sprites hook in here later.
const events: Record<string, string[]> = narratorData.events;

let captionEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

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

export function narrate(event: string, vars: Record<string, string> = {}): void {
  // Check specific-key overrides first: "landmark.enter.Flat Bridge" before "landmark.enter".
  // Lets narrator.json carry per-road/per-landmark flavour lines with no call-site changes.
  let lines = events[event];
  for (const v of Object.values(vars)) {
    const specific = events[`${event}.${v}`];
    if (specific?.length) { lines = specific; break; }
  }
  if (!lines?.length || !captionEl) return;
  let line = lines[Math.floor(Math.random() * lines.length)];
  for (const [k, v] of Object.entries(vars)) line = line.replaceAll(`{${k}}`, v);
  captionEl.textContent = `\u{1F399} ${line}`;
  captionEl.style.opacity = '1';
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (captionEl) captionEl.style.opacity = '0'; }, 3500);
}
