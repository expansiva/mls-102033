/// <mls fileReference="_102033_/l2/molecules/groupplaymedia/ml-video-player.ts" enhancement="_102020_/l2/enhancementAura" />

// =============================================================================
// VIDEO PLAYER MOLECULE
// =============================================================================
// Skill Group: play + media
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  loading: 'Loading media...',
  noSource: 'No media source provided',
  error: 'Unable to play media',
  mute: 'Mute',
  unmute: 'Unmute',
  captionsOn: 'Captions on',
  captionsOff: 'Captions off',
  fullscreen: 'Fullscreen',
  volume: 'Volume',
  progress: 'Progress',
  player: 'Media player',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    play: 'Reproduzir',
    pause: 'Pausar',
    replay: 'Reproduzir novamente',
    loading: 'Carregando mídia...',
    noSource: 'Nenhuma fonte de mídia fornecida',
    error: 'Não foi possível reproduzir a mídia',
    mute: 'Silenciar',
    unmute: 'Ativar som',
    captionsOn: 'Legendas ativadas',
    captionsOff: 'Legendas desativadas',
    fullscreen: 'Tela cheia',
    volume: 'Volume',
    progress: 'Progresso',
    player: 'Reprodutor de mídia',
  },
};
/// **collab_i18n_end**

@customElement('groupplaymedia--ml-video-player')
export class VideoPlayerMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Source', 'Track'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: String })
  poster: string = '';

  @propertyDataSource({ type: Boolean })
  autoplay = false;

  @propertyDataSource({ type: Boolean })
  loop = false;

  @propertyDataSource({ type: Boolean })
  muted = false;

  @propertyDataSource({ type: String })
  preload: string = 'metadata';

  @propertyDataSource({ type: Boolean })
  disabled = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  // =========================================================================
  // INTERNAL STATE
  // =========================================================================
  @state()
  private isPlaying = false;

  @state()
  private currentTime = 0;

  @state()
  private duration = 0;

  @state()
  private volume = 1;

  @state()
  private isMuted = false;

  @state()
  private hasEnded = false;

  @state()
  private captionsEnabled = false;

  // =========================================================================
  // STATE CHANGE HANDLER (derived values)
  // =========================================================================
  handleIcaStateChange(key: string, value: any) {
    const mutedAttr = this.getAttribute('muted');
    if (mutedAttr === `{{${key}}}`) {
      this.isMuted = Boolean(value);
      const media = this.getMediaElement();
      if (media) media.muted = this.isMuted;
    }
    this.requestUpdate();
  }

  // =========================================================================
  // PUBLIC METHODS — Playback Controls
  // =========================================================================
  playMedia() {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media || !this.hasSources()) {
      this.emitError(this.msg.noSource);
      return;
    }
    media.play().catch(() => this.emitError(this.msg.error));
  }

  pauseMedia() {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media) return;
    media.pause();
  }

  togglePlay() {
    if (this.isPlaying) this.pauseMedia();
    else this.playMedia();
  }

  seekTo(seconds: number) {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media || !this.duration) return;
    media.currentTime = Math.max(0, Math.min(this.duration, seconds));
  }

  setVolume(value: number) {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media) return;
    const clamped = Math.max(0, Math.min(1, value));
    media.volume = clamped;
    this.volume = clamped;
    if (clamped === 0) {
      media.muted = true;
      this.isMuted = true;
    }
  }

  toggleMute() {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media) return;
    media.muted = !media.muted;
    this.isMuted = media.muted;
  }

  enterFullscreen() {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media) return;
    if (media.requestFullscreen) media.requestFullscreen();
  }

  toggleCaptions() {
    if (this.isBlocked()) return;
    const media = this.getMediaElement();
    if (!media || !media.textTracks) return;
    const enable = !this.captionsEnabled;
    Array.from(media.textTracks).forEach(track => {
      track.mode = enable ? 'showing' : 'disabled';
    });
    this.captionsEnabled = enable;
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handlePlay() {
    this.isPlaying = true;
    this.hasEnded = false;
    this.dispatchEvent(
      new CustomEvent('play', {
        bubbles: true,
        composed: true,
        detail: {},
      })
    );
  }

  private handlePause() {
    this.isPlaying = false;
    this.dispatchEvent(
      new CustomEvent('pause', {
        bubbles: true,
        composed: true,
        detail: {},
      })
    );
  }

  private handleEnded() {
    this.isPlaying = false;
    this.hasEnded = true;
    this.dispatchEvent(
      new CustomEvent('ended', {
        bubbles: true,
        composed: true,
        detail: {},
      })
    );
  }

  private handleTimeUpdate() {
    const media = this.getMediaElement();
    if (!media) return;
    this.currentTime = media.currentTime || 0;
    this.duration = media.duration || 0;
    this.dispatchEvent(
      new CustomEvent('timeUpdate', {
        bubbles: true,
        composed: true,
        detail: { currentTime: this.currentTime, duration: this.duration },
      })
    );
  }

  private handleLoadedMetadata() {
    const media = this.getMediaElement();
    if (!media) return;
    this.duration = media.duration || 0;
    this.volume = media.volume || 1;
    this.isMuted = media.muted || false;
  }

  private handleVolumeChange() {
    const media = this.getMediaElement();
    if (!media) return;
    this.volume = media.volume || 1;
    this.isMuted = media.muted || false;
  }

  private handleMediaError() {
    this.emitError(this.msg.error);
  }

  private handleSeekInput(e: Event) {
    if (this.isBlocked()) return;
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.seekTo(value);
  }

  private handleVolumeInput(e: Event) {
    if (this.isBlocked()) return;
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.setVolume(value);
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.isBlocked()) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.togglePlay();
      return;
    }
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.seekTo(this.currentTime - 5);
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.seekTo(this.currentTime + 5);
      return;
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      this.setVolume(this.volume + 0.05);
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      this.setVolume(this.volume - 0.05);
    }
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    const labelContent = this.hasSlot('Label') ? this.getSlotContent('Label') : '';
    const ariaLabel = this.getSlot('Label')?.textContent?.trim() || this.msg.player;

    if (this.loading) {
      return html`
        <div class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-400">
          ${this.msg.loading}
        </div>
      `;
    }

    const sources = this.readSources();
    const tracks = this.readTracks();

    if (sources.length === 0) {
      return html`
        <div class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm text-red-600 dark:text-red-400">
          ${this.msg.noSource}
        </div>
      `;
    }

    const isBlocked = this.isBlocked();

    return html`
      <div class="w-full">
        ${this.renderLabel(labelContent)}
        <div
          class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
          tabindex="0"
          aria-label="${ariaLabel}"
          @keydown=${this.handleKeyDown}
        >
          <div class="relative w-full overflow-hidden rounded-md bg-black">
            <video
              class="w-full h-auto"
              ?autoplay=${this.autoplay}
              ?loop=${this.loop}
              ?muted=${this.isMuted || this.muted}
              preload=${ifDefined(this.preload || undefined)}
              poster=${ifDefined(this.poster || undefined)}
              @play=${this.handlePlay}
              @pause=${this.handlePause}
              @ended=${this.handleEnded}
              @timeupdate=${this.handleTimeUpdate}
              @error=${this.handleMediaError}
              @loadedmetadata=${this.handleLoadedMetadata}
              @volumechange=${this.handleVolumeChange}
            >
              ${sources.map(
      item => html`<source src=${item.src} type=${ifDefined(item.type || undefined)} />`
    )}
              ${tracks.map(
      track => html`<track src=${track.src} kind=${track.kind} srclang=${track.lang} label=${track.label} />`
    )}
            </video>
          </div>

          <div class="mt-3 flex flex-col gap-3">
            ${this.renderControls(isBlocked, tracks.length > 0)}
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================
  private renderLabel(content: string): TemplateResult {
    if (!content) return html`${nothing}`;
    return html`
      <div class="mb-2 text-sm text-slate-600 dark:text-slate-400">
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderControls(isBlocked: boolean, hasTracks: boolean): TemplateResult {
    const playLabel = this.hasEnded ? this.msg.replay : this.isPlaying ? this.msg.pause : this.msg.play;
    const timeLabel = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;

    return html`
      <div class="flex flex-wrap items-center gap-3">
        <button
          class="${this.getButtonClasses(isBlocked)}"
          type="button"
          aria-label="${playLabel}"
          ?disabled=${isBlocked}
          @click=${this.togglePlay}
        >
          ${playLabel}
        </button>

        <div class="flex items-center gap-2 flex-1 min-w-[160px]">
          <input
            class="${this.getRangeClasses(isBlocked)}"
            type="range"
            min="0"
            max="${this.duration || 0}"
            step="0.1"
            .value=${String(this.currentTime)}
            aria-label="${this.msg.progress}"
            role="slider"
            aria-valuemin="0"
            aria-valuemax="${this.duration || 0}"
            aria-valuenow="${this.currentTime}"
            ?disabled=${isBlocked}
            @input=${this.handleSeekInput}
          />
          <span class="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">${timeLabel}</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="${this.getButtonClasses(isBlocked)}"
            type="button"
            aria-label="${this.isMuted ? this.msg.unmute : this.msg.mute}"
            ?disabled=${isBlocked}
            @click=${this.toggleMute}
          >
            ${this.isMuted ? this.msg.unmute : this.msg.mute}
          </button>
          <input
            class="${this.getRangeClasses(isBlocked)} w-24"
            type="range"
            min="0"
            max="1"
            step="0.01"
            .value=${String(this.volume)}
            aria-label="${this.msg.volume}"
            role="slider"
            aria-valuemin="0"
            aria-valuemax="1"
            aria-valuenow="${this.volume}"
            ?disabled=${isBlocked}
            @input=${this.handleVolumeInput}
          />
        </div>

        ${hasTracks
        ? html`
              <button
                class="${this.getButtonClasses(isBlocked)}"
                type="button"
                aria-label="${this.captionsEnabled ? this.msg.captionsOn : this.msg.captionsOff}"
                ?disabled=${isBlocked}
                @click=${this.toggleCaptions}
              >
                ${this.captionsEnabled ? this.msg.captionsOn : this.msg.captionsOff}
              </button>
            `
        : html`${nothing}`}

        <button
          class="${this.getButtonClasses(isBlocked)}"
          type="button"
          aria-label="${this.msg.fullscreen}"
          ?disabled=${isBlocked}
          @click=${this.enterFullscreen}
        >
          ${this.msg.fullscreen}
        </button>
      </div>
    `;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private readSources(): Array<{ src: string; type: string }> {
    return this.getSlots('Source')
      .map(el => ({
        src: el.getAttribute('src') || '',
        type: el.getAttribute('type') || '',
      }))
      .filter(item => Boolean(item.src));
  }

  private readTracks(): Array<{ src: string; kind: string; lang: string; label: string }> {
    return this.getSlots('Track')
      .map(el => ({
        src: el.getAttribute('src') || '',
        kind: el.getAttribute('kind') || 'subtitles',
        lang: el.getAttribute('lang') || '',
        label: el.getAttribute('label') || '',
      }))
      .filter(item => Boolean(item.src));
  }

  private hasSources(): boolean {
    return this.readSources().length > 0;
  }

  private getMediaElement(): HTMLVideoElement | null {
    return this.querySelector('video');
  }

  private formatTime(value: number): string {
    if (!value || Number.isNaN(value)) return '00:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  private emitError(message: string) {
    this.dispatchEvent(
      new CustomEvent('error', {
        bubbles: true,
        composed: true,
        detail: { message },
      })
    );
  }

  private isBlocked(): boolean {
    return this.disabled || this.loading;
  }

  private getButtonClasses(disabled: boolean): string {
    return [
      'px-3 py-1.5 rounded-md text-xs font-medium border transition',
      'bg-white dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'border-slate-200 dark:border-slate-700',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      !disabled ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'opacity-50 cursor-not-allowed',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getRangeClasses(disabled: boolean): string {
    return [
      'h-2 rounded-lg appearance-none cursor-pointer w-full',
      'bg-slate-100 dark:bg-slate-700',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}
