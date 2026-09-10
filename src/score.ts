// Score module — tracks the player's score and renders it to the HUD.
// V1 formula (per GAME_SPEC): distance driven, goat penalties, tyre-burst penalties,
// near-miss bonuses. Style/swerves deferred until acceleration data is available.
export class Score {
  private pts = 0;
  private el: HTMLElement;
  private prevTyreBurst = false;

  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', top: '12px', right: '16px',
      fontFamily: 'system-ui, sans-serif', fontWeight: '700',
      fontSize: '18px', color: '#fff',
      textShadow: '0 1px 4px rgba(0,0,0,0.8)', userSelect: 'none',
      lineHeight: '1.4',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
    this._render();
  }

  // Call each frame with metres driven this tick.
  // +1 pt per compressed-world km so a full run is roughly 100–150 pts from distance.
  addMetres(m: number): void {
    this.pts += m / 1000;
    this._render();
  }

  // Positive or negative adjustment.
  // Callers: Goats (-50 hit, +10 near-miss), tyre burst (-30).
  adjust(delta: number): void {
    this.pts = Math.max(0, this.pts + delta);
    this._render();
  }

  // Detects tyre-burst state transitions each frame (-30 per new burst).
  tick(tyreBurstNow: boolean): void {
    if (tyreBurstNow && !this.prevTyreBurst) this.adjust(-30);
    this.prevTyreBurst = tyreBurstNow;
  }

  get points(): number {
    return Math.round(this.pts);
  }

  private _render(): void {
    this.el.textContent = `⭐ ${Math.round(this.pts).toLocaleString()}`;
  }
}
