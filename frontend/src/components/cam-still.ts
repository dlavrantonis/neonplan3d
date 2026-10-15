// Camera still that refreshes every few seconds, with play (WebRTC) and fullscreen under the frame.

import { css, html, LitElement, nothing } from "lit";
import { translate, type I18nKey } from "../i18n.ts";
import type { HomeAssistant } from "../types.ts";

export class Fp3dCamStill extends LitElement {
  static properties = {
    hass: { attribute: false },
    entity: { attribute: false },
    picture: { attribute: false },
    note: { attribute: false },
    label: { attribute: false },
    alt: { attribute: false },
    look: { attribute: false },
    readOnly: { type: Boolean },
    _tick: { state: true },
    _live: { state: true },
    _connecting: { state: true },
    _fs: { state: true },
  };

  declare hass: HomeAssistant;
  declare entity: string;
  declare picture: string | undefined;
  /** Shown in the frame when there is no snapshot. */
  declare note: string;
  /** Name drawn on the picture. */
  declare label: string;
  declare alt: string;
  /** "Look through the camera", when this camera sits on the plan. */
  declare look: string;
  declare readOnly: boolean;
  private declare _tick: number;
  private declare _live: boolean;
  private declare _connecting: boolean;
  /** The frame fills the screen (the browser's fullscreen, or a full-viewport cover when that is refused). */
  private declare _fs: boolean;
  private timer: ReturnType<typeof setInterval> | undefined;
  private watch: ReturnType<typeof setInterval> | undefined;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this._fs) this.closeFs();
  };

  constructor() {
    super();
    this.entity = "";
    this.note = "";
    this.label = "";
    this.alt = "";
    this.look = "";
    this.readOnly = false;
    this._tick = 0;
    this._live = false;
    this._connecting = false;
    this._fs = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._live = false;
    this._connecting = false;
    this._fs = false;
    document.addEventListener("keydown", this.onKey);
    this.timer = setInterval(() => {
      if (this._live || !this.picture || this.picture.startsWith("data:") || document.hidden) return;
      this._tick++;
    }, 3000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.onKey);
    if (this._fs) this.leaveFs();
    clearInterval(this.timer);
    clearInterval(this.watch);
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("entity")) {
      this._live = false;
      this._connecting = false;
    }
  }

  protected updated(): void {
    this.toggleAttribute("fs", this._fs);
    if (this._live && this._connecting) {
      if (this.watch) return;
      this.watch = setInterval(() => this.check(), 200);
      this.check();
    } else if (this.watch) {
      clearInterval(this.watch);
      this.watch = undefined;
    }
  }

  private play(): void {
    if (this.readOnly) return;
    if (this._live) {
      this._live = false;
      this._connecting = false;
      this._tick++;
      return;
    }
    this._connecting = true;
    this._live = true;
  }

  /** The player lives in its own shadow root. The wait ends on a real live picture, and comes back if that picture drops. */
  private check(): void {
    const player = this.renderRoot.querySelector("ha-web-rtc-player") as (HTMLElement & { _error?: string }) | null;
    const video = player?.shadowRoot?.querySelector("video");
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const frame = !!video && video.videoWidth >= 64 && track?.readyState === "live";
    if (player?._error) this._connecting = false;
    else if (this._live && this._connecting === frame) this._connecting = !frame;
  }

  private t(key: I18nKey): string {
    return translate(this.hass, key);
  }

  /** Leave the browser's fullscreen. The element sits in a shadow tree, so it is not document.fullscreenElement. */
  private leaveFs(): void {
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    try {
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => undefined);
      else doc.webkitExitFullscreen?.();
    } catch {
      /* already small */
    }
  }

  private closeFs(): void {
    this.leaveFs();
    this._fs = false;
  }

  /** Grow the current still or live picture. Does not open Home Assistant's camera card. */
  private toggleFs(): void {
    if (this._fs) {
      this.closeFs();
      return;
    }
    this._fs = true;
    const el = this as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const pending = el.requestFullscreen?.();
      if (pending) void pending.catch(() => undefined);
      else el.webkitRequestFullscreen?.();
    } catch {
      /* the cover still fills the page */
    }
  }

  protected render() {
    const picture = this.picture;
    const src = picture ? (picture.startsWith("data:") ? picture : `${picture}${picture.includes("?") ? "&" : "?"}fp3d=${this._tick}`) : "";
    const poster = picture && !picture.startsWith("data:") ? picture : src;
    const live = this._live;
    return html`<div class="box">
        ${live
          ? html`<ha-web-rtc-player autoplay playsinline entityid=${this.entity} poster-url=${poster}></ha-web-rtc-player>
            ${this._connecting ? html`<div class="wait" role="status"><span></span></div>` : nothing}`
          : src
            ? html`<img src=${src} alt=${this.alt || this.label} />`
            : html`<span class="note">${this.note}</span>`}
        ${this.label ? html`<span class="name">${this.label}</span>` : nothing}
        ${this.look
          ? html`<button class="look" title=${this.look} @click=${() => !this.readOnly && this.dispatchEvent(new CustomEvent("look", { bubbles: true, composed: true }))}>${this.look}</button>`
          : nothing}
      </div>
      <div class="bar">
        <button class="btn" title=${this.t(live ? "camera_stop" : "camera_play")} aria-label=${this.t(live ? "camera_stop" : "camera_play")} @click=${() => this.play()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d=${live ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M8 5v14l11-7z"} /></svg>
        </button>
        <button class="btn" title=${this.t(this._fs ? "fullscreen_exit" : "fullscreen")} aria-label=${this.t(this._fs ? "fullscreen_exit" : "fullscreen")} @click=${() => this.toggleFs()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d=${this._fs ? "M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5" : "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"} />
          </svg>
        </button>
      </div>`;
  }

  static styles = css`
    :host { display: block; }
    .box { position: relative; margin: 6px 0 2px; border: 1px solid var(--fp3d-line); border-radius: 12px; overflow: hidden; background: #05080f; }
    .box img, .box ha-web-rtc-player { display: block; width: 100%; height: 100%; aspect-ratio: 16/9; object-fit: cover; --video-max-height: none; }
    .note { display: block; padding: 28px 8px; color: var(--fp3d-muted); font-size: 13px; text-align: center; }
    .name { position: absolute; left: 8px; bottom: 6px; padding: 2px 8px; border-radius: 8px; background: rgba(7, 11, 20, 0.75); color: var(--fp3d-text); font-size: 12px; font-weight: 600; }
    .look { position: absolute; right: 8px; bottom: 12px; padding: 4px 10px; border: 1px solid var(--fp3d-line); border-radius: 999px; background: rgba(7, 11, 20, 0.8); color: var(--fp3d-accent, #37e0ff); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .bar { display: flex; align-items: center; justify-content: space-between; margin: 0 2px 4px 4px; }
    .btn { display: grid; place-items: center; width: 22px; height: 22px; margin: 0; padding: 0; border: 0; background: none; color: var(--fp3d-accent, #37e0ff); cursor: pointer; }
    :host([fs]) { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; background: #000; }
    :host([fs]) .box { flex: 1; min-height: 0; margin: 0; border: 0; border-radius: 0; }
    :host([fs]) .box img, :host([fs]) .box ha-web-rtc-player { width: 100%; height: 100%; aspect-ratio: auto; object-fit: contain; }
    :host([fs]) .look { display: none; }
    :host([fs]) .bar { flex: none; margin: 0; padding: 8px 16px 14px; }
    :host([fs]) .btn { width: 36px; height: 36px; }
    :host([fs]) .btn svg { width: 22px; height: 22px; }
    .wait { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4, 10, 22, 0.28); pointer-events: none; }
    .wait span { width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid rgba(55, 224, 255, 0.28); border-top-color: var(--fp3d-accent, #37e0ff); animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
}

if (!customElements.get("fp3d-cam-still")) customElements.define("fp3d-cam-still", Fp3dCamStill);
