/// <mls fileReference="_102033_/l2/molecules/groupscancode/ml-scan-code.ts" enhancement="_102020_/l2/enhancementAura" />

// =============================================================================
// ML SCAN CODE MOLECULE
// =============================================================================
// Skill Group: scan + code
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  openCamera: 'Open camera',
  capture: 'Capture',
  close: 'Close',
  scanAgain: 'Scan again',
  loading: 'Processing...',
  autoCapture: 'Auto scanning...',
  permissionDenied: 'Camera permission denied',
  cameraUnavailable: 'Camera unavailable',
  unknownError: 'Unable to open camera',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    openCamera: 'Abrir câmera',
    capture: 'Capturar',
    close: 'Fechar',
    scanAgain: 'Ler novamente',
    loading: 'Processando...',
    autoCapture: 'Escaneando automaticamente...',
    permissionDenied: 'Permissão da câmera negada',
    cameraUnavailable: 'Câmera indisponível',
    unknownError: 'Não foi possível abrir a câmera',
  },
};
/// **collab_i18n_end**

@customElement('groupscancode--ml-scan-code')
export class MlScanCodeMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;
  private stream: MediaStream | null = null;
  private autoTimer: number | null = null;
  private errorId = `scan-error-${Math.random().toString(36).slice(2)}`;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Helper', 'Trigger', 'Result'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: String })
  value: string | null = null;

  @propertyDataSource({ type: String })
  error: string = '';

  @propertyDataSource({ type: String })
  name = '';

  @propertyDataSource({ type: String })
  facing: 'environment' | 'user' = 'environment';

  @propertyDataSource({ type: Boolean, attribute: 'auto-capture' })
  autoCapture = false;

  @propertyDataSource({ type: Number, attribute: 'capture-interval' })
  captureInterval = 500;

  @propertyDataSource({ type: Boolean })
  disabled = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  // =========================================================================
  // INTERNAL STATE
  // =========================================================================
  @state()
  private isOpen = false;

  @state()
  private isCapturing = false;

  @state()
  private cameraReady = false;

  // =========================================================================
  // LIFECYCLE
  // =========================================================================
  disconnectedCallback() {
    this.stopCamera();
    super.disconnectedCallback();
  }

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('value')) {
      this.dispatchEvent(
        new CustomEvent('change', {
          bubbles: true,
          composed: true,
          detail: { value: this.value },
        })
      );

      if (this.value !== null && this.isOpen) {
        this.closeCamera();
      }
    }

    if ((changedProps.has('autoCapture') || changedProps.has('captureInterval')) && this.isOpen) {
      this.setupAutoCapture();
    }
  }

  // =========================================================================
  // CAMERA CONTROL
  // =========================================================================
  private async openCamera() {
    if (this.disabled || this.isOpen) return;
    this.isOpen = true;
    this.cameraReady = false;

    await this.updateComplete;
    await this.startCamera();
  }

  private closeCamera() {
    if (this.disabled) return;
    this.stopCamera();
    this.isOpen = false;
    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
        detail: {},
      })
    );
  }

  private async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facing },
      });

      this.stream = stream;
      const video = this.getVideoElement();
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      this.cameraReady = true;
      this.setupAutoCapture();

      this.dispatchEvent(
        new CustomEvent('open', {
          bubbles: true,
          composed: true,
          detail: {},
        })
      );
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        this.error = this.msg.permissionDenied;
      } else if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
        this.error = this.msg.cameraUnavailable;
      } else {
        this.error = this.msg.unknownError;
      }
      this.isOpen = false;
    }
  }

  private stopCamera() {
    if (this.autoTimer !== null) {
      window.clearInterval(this.autoTimer);
      this.autoTimer = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.cameraReady = false;
  }

  private setupAutoCapture() {
    if (!this.isOpen || !this.autoCapture) {
      if (this.autoTimer !== null) {
        window.clearInterval(this.autoTimer);
        this.autoTimer = null;
      }
      return;
    }

    if (this.autoTimer !== null) {
      window.clearInterval(this.autoTimer);
      this.autoTimer = null;
    }

    this.autoTimer = window.setInterval(() => {
      if (!this.isOpen || this.loading || this.disabled) return;
      this.captureFrame();
    }, this.captureInterval);
  }

  private captureFrame() {
    if (this.disabled || this.loading || !this.cameraReady || this.isCapturing) return;
    const video = this.getVideoElement();
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/png');

    this.isCapturing = true;
    window.setTimeout(() => {
      this.isCapturing = false;
    }, 200);

    this.dispatchEvent(
      new CustomEvent('capture', {
        bubbles: true,
        composed: true,
        detail: { image },
      })
    );
  }

  private getVideoElement(): HTMLVideoElement | null {
    return this.querySelector('video[data-role="scanner"]');
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handleTriggerClick() {
    if (this.disabled) return;
    this.openCamera();
  }

  private handleCaptureClick() {
    this.captureFrame();
  }

  private handleScanAgain() {
    if (this.disabled) return;
    this.value = null;
    this.openCamera();
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.isOpen) {
      this.closeCamera();
    }
  }

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================
  private getRootClasses(): string {
    return [
      'w-full rounded-xl border p-4 space-y-3',
      'bg-white dark:bg-slate-800',
      'border-slate-200 dark:border-slate-700',
      'text-slate-900 dark:text-slate-100',
      this.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-default',
    ].filter(Boolean).join(' ');
  }

  private getActionButtonClasses(): string {
    return [
      'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border transition',
      'bg-white dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'border-slate-200 dark:border-slate-700',
      'hover:bg-slate-50 dark:hover:bg-slate-700',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      this.disabled ? 'opacity-50 cursor-not-allowed' : '',
    ].filter(Boolean).join(' ');
  }

  private getCaptureButtonClasses(): string {
    return [
      'inline-flex items-center justify-center rounded-full w-14 h-14 border-4 transition',
      'bg-white dark:bg-slate-900',
      'border-sky-500 dark:border-sky-400',
      'text-slate-900 dark:text-slate-100',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      this.isCapturing ? 'scale-95' : '',
      this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : '',
    ].filter(Boolean).join(' ');
  }

  private getViewfinderClasses(): string {
    return [
      'relative w-full aspect-video rounded-xl overflow-hidden border',
      'bg-slate-50 dark:bg-slate-900',
      'border-slate-200 dark:border-slate-700',
    ].filter(Boolean).join(' ');
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    return html`<div class="text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Label'))}</div>`;
  }

  private renderHelperOrError(): TemplateResult {
    if (this.error) {
      return html`<p id="${this.errorId}" class="text-xs text-red-600 dark:text-red-400">${this.error}</p>`;
    }
    if (this.hasSlot('Helper')) {
      return html`<p class="text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
    }
    return html``;
  }

  private renderTrigger(): TemplateResult {
    const content = this.hasSlot('Trigger')
      ? html`${unsafeHTML(this.getSlotContent('Trigger'))}`
      : html`<span>${this.msg.openCamera}</span>`;

    return html`
      <button
        type="button"
        class="${this.getActionButtonClasses()}"
        ?disabled=${this.disabled}
        role="button"
        aria-label="${this.msg.openCamera}"
        aria-describedby=${ifDefined(this.error ? this.errorId : undefined)}
        @click=${this.handleTriggerClick}
      >
        ${content}
      </button>
    `;
  }

  private renderResult(): TemplateResult {
    const resultContent = this.hasSlot('Result')
      ? html`${unsafeHTML(this.getSlotContent('Result'))}`
      : html`<span class="text-sm text-slate-900 dark:text-slate-100">${this.value ?? ''}</span>`;

    return html`
      <div class="space-y-3" aria-live="polite">
        <div class="rounded-lg border p-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          ${resultContent}
        </div>
        <button
          type="button"
          class="${this.getActionButtonClasses()}"
          ?disabled=${this.disabled}
          @click=${this.handleScanAgain}
        >
          ${this.msg.scanAgain}
        </button>
      </div>
    `;
  }

  private renderViewfinder(): TemplateResult {
    return html`
      <div class="${this.getViewfinderClasses()}" @keydown=${this.handleKeydown} tabindex="0">
        <video data-role="scanner" class="w-full h-full object-cover" aria-hidden="true" autoplay muted playsinline></video>
        ${this.loading
          ? html`
              <div class="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70">
                <div class="text-sm text-slate-900 dark:text-slate-100">${this.msg.loading}</div>
              </div>
            `
          : nothing}
      </div>
      <div class="flex items-center justify-between">
        ${this.autoCapture
          ? html`<span class="text-xs text-slate-500 dark:text-slate-400">${this.msg.autoCapture}</span>`
          : html`
              <button
                type="button"
                class="${this.getCaptureButtonClasses()}"
                aria-label="${this.msg.capture}"
                ?disabled=${this.disabled || this.loading}
                @click=${this.handleCaptureClick}
              ></button>
            `}
        <button
          type="button"
          class="${this.getActionButtonClasses()}"
          aria-label="${this.msg.close}"
          ?disabled=${this.disabled}
          @click=${this.closeCamera}
        >
          ${this.msg.close}
        </button>
      </div>
    `;
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    const hasValue = this.value !== null;

    return html`
      <div class="${this.getRootClasses()}" aria-describedby=${ifDefined(this.error ? this.errorId : undefined)}>
        ${this.renderLabel()}
        <div class="space-y-3">
          ${this.isOpen
            ? this.renderViewfinder()
            : hasValue
              ? this.renderResult()
              : this.renderTrigger()}
        </div>
        ${this.renderHelperOrError()}
      </div>
    `;
  }
}
