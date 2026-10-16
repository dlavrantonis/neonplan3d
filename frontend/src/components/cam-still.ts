// Camera still that refreshes every few seconds, with play (WebRTC) and fullscreen under the frame.

import { css, html, LitElement, nothing } from "lit";
import { translate, type I18nKey } from "../i18n.ts";
import type { HomeAssistant } from "../types.ts";

/** Filled speaker with waves, and the same speaker with a slash. One path each, so the button swaps shape. */
const ICON_SOUND = "M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.84-5 6.7v2.07C18 19.86 21 16.28 21 12S18 4.14 14 3.23M16.5 12c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.71 2.5-2.24 2.5-4.02M3 9v6h4l5 5V4L7 9z";
const ICON_MUTED = "M12 4 9.91 6.09 12 8.18M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.26c-.67.51-1.42.93-2.25 1.17v-1.93c.46-.17.88-.41 1.25-.72l1.48 1.48c-.62.62-1.35 1.13-2.15 1.51-.36.16-.58.54-.58.96 0 .55.45 1 1 1 .28 0 .53-.11.72-.29l4.01 4.02L21 23.46 12 14.46V4m7 8c0 .94-.2 1.82-.54 2.64l1.51 1.51c.65-1.24 1.03-2.65 1.03-4.15 0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.05-.2.05-.42.05-.63";

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
    _muted: { state: true },
    _volume: { state: true },
    _audio: { state: true },
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
  /** Live audio stays off until the mute button is pressed. */
  private declare _muted: boolean;
  /** Playback level while live, 0–1. Kept when muted, so unmute returns to it. */
  private declare _volume: number;
  /** The live picture has an audio track that is actually sending. */
  private declare _audio: boolean;
  /** The frame fills the screen (the browser's fullscreen, or a full-viewport cover when that is refused). */
  private declare _fs: boolean;
  private timer: ReturnType<typeof setInterval> | undefined;
  private watch: ReturnType<typeof setInterval> | undefined;
  /** The browser accepted requestFullscreen. Escape ends that without a key event, so the cover has to follow fullscreenchange. */
  private browserFs = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this._fs) this.closeFs();
  };
  private readonly onFullscreen = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    if (doc.fullscreenElement || doc.webkitFullscreenElement || !this.browserFs) return;
    this.browserFs = false;
    this._fs = false;
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
    this._muted = true;
    this._volume = 1;
    this._audio = false;
    this._fs = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._live = false;
    this._connecting = false;
    this._muted = true;
    this._volume = 1;
    this._audio = false;
    this._fs = false;
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("fullscreenchange", this.onFullscreen);
    document.addEventListener("webkitfullscreenchange", this.onFullscreen);
    this.timer = setInterval(() => {
      if (this._live || !this.picture || this.picture.startsWith("data:") || document.hidden) return;
      this._tick++;
    }, 3000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("fullscreenchange", this.onFullscreen);
    document.removeEventListener("webkitfullscreenchange", this.onFullscreen);
    if (this._fs) this.leaveFs();
    clearInterval(this.timer);
    clearInterval(this.watch);
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("entity")) {
      this._live = false;
      this._connecting = false;
      this._muted = true;
      this._volume = 1;
      this._audio = false;
    }
  }

  protected updated(): void {
    this.toggleAttribute("fs", this._fs);
    if (this._live) {
      this.syncSound();
      if (this.watch) return;
      this.watch = setInterval(() => this.tickLive(), 100);
      this.tickLive();
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
      this._muted = true;
      this._volume = 1;
      this._audio = false;
      this._tick++;
      return;
    }
    this._muted = true;
    this._volume = 1;
    this._audio = false;
    this._connecting = true;
    this._live = true;
  }

  private tickLive(): void {
    this.syncSound();
    if (this._connecting) this.check();
  }

  /**
   * Mute only after a picture is on screen. Doing it earlier makes ha-web-rtc-player
   * throw away the audio track, and an AudioContext on the same stream stops the picture.
   */
  private syncSound(): void {
    const player = this.renderRoot.querySelector("ha-web-rtc-player") as (HTMLElement & { muted?: boolean }) | null;
    const video = player?.shadowRoot?.querySelector("video");
    if (!video || this._connecting) return;
    const stream = video.srcObject;
    const audible = stream instanceof MediaStream && stream.getAudioTracks().some((track) => track.readyState === "live");
    if (audible !== this._audio) this._audio = audible;
    if (!audible) return;
    video.muted = this._muted;
    video.volume = this._volume;
    if (player && player.muted !== this._muted) player.muted = this._muted;
    if (video.paused) void video.play().catch(() => undefined);
  }

  private toggleMute(): void {
    this._muted = !this._muted;
    this.syncSound();
  }

  private setVolume(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this._volume = Number(input.value) / 100;
    this.syncSound();
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
    this.browserFs = false;
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
      if (pending) {
        this.browserFs = true;
        void pending.catch(() => { this.browserFs = false; });
      } else {
        el.webkitRequestFullscreen?.();
        this.browserFs = true;
      }
    } catch {
      this.browserFs = false;
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
            ? html`<img src=${src} alt=${this.alt || this.label} draggable="false" />`
            : html`<span class="note">${this.note}</span>`}
        ${this.label ? html`<span class="name">${this.label}</span>` : nothing}
        ${this.look
          ? html`<button class="look" title=${this.look} @click=${() => !this.readOnly && this.dispatchEvent(new CustomEvent("look", { bubbles: true, composed: true }))}>${this.look}</button>`
          : nothing}
      </div>
      <div class="bar">
        <span class="left">
          <button class="btn" title=${this.t(live ? "camera_stop" : "camera_play")} aria-label=${this.t(live ? "camera_stop" : "camera_play")} @click=${() => this.play()}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d=${live ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M8 5v14l11-7z"} /></svg>
          </button>
          ${live && this._audio && !this._connecting
            ? html`<button class="btn" title=${this.t(this._muted ? "camera_unmute" : "camera_mute")} aria-label=${this.t(this._muted ? "camera_unmute" : "camera_mute")} aria-pressed=${this._muted ? "true" : "false"} @click=${() => this.toggleMute()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d=${this._muted ? ICON_MUTED : ICON_SOUND} /></svg>
            </button>
            <input class="vol" type="range" min="0" max="100" step="1" value=${Math.round(this._volume * 100)} aria-label=${this.t("camera_volume")} title=${this.t("camera_volume")} @input=${this.setVolume} />`
            : nothing}
        </span>
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
    .box img, .box ha-web-rtc-player { display: block; width: 100%; height: 100%; aspect-ratio: 16/9; object-fit: cover; --video-max-height: none; -webkit-user-drag: none; }
    .note { display: block; padding: 28px 8px; color: var(--fp3d-muted); font-size: 13px; text-align: center; }
    .name { position: absolute; left: 8px; bottom: 6px; padding: 2px 8px; border-radius: 8px; background: rgba(7, 11, 20, 0.75); color: var(--fp3d-text); font-size: 12px; font-weight: 600; }
    .look { position: absolute; right: 8px; bottom: 12px; padding: 4px 10px; border: 1px solid var(--fp3d-line); border-radius: 999px; background: rgba(7, 11, 20, 0.8); color: var(--fp3d-accent, #37e0ff); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .bar { display: flex; align-items: center; justify-content: space-between; margin: 0 2px 4px 4px; }
    .left { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .btn { display: grid; place-items: center; flex: none; width: 22px; height: 22px; margin: 0; padding: 0; border: 0; background: none; color: var(--fp3d-accent, #37e0ff); cursor: pointer; }
    .vol { width: 72px; height: 16px; margin: 0; accent-color: var(--fp3d-accent, #37e0ff); cursor: pointer; }
    :host([fs]) { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; background: #000; }
    :host([fs]) .box { flex: 1; min-height: 0; margin: 0; border: 0; border-radius: 0; }
    :host([fs]) .box img, :host([fs]) .box ha-web-rtc-player { width: 100%; height: 100%; aspect-ratio: auto; object-fit: contain; }
    :host([fs]) .look { display: none; }
    :host([fs]) .bar { flex: none; margin: 0; padding: 8px 16px 14px; }
    :host([fs]) .btn { width: 36px; height: 36px; }
    :host([fs]) .btn svg { width: 22px; height: 22px; }
    :host([fs]) .vol { width: 160px; height: 22px; }
    .wait { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4, 10, 22, 0.28); pointer-events: none; }
    .wait span { width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid rgba(55, 224, 255, 0.28); border-top-color: var(--fp3d-accent, #37e0ff); animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
}

if (!customElements.get("fp3d-cam-still")) customElements.define("fp3d-cam-still", Fp3dCamStill);
