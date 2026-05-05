/// <mls fileReference="_102033_/l2/molecules/groupselectfileforupload/ml-file-upload-preview.ts" enhancement="_102020_/l2/enhancementAura"/>

// =============================================================================
// ML FILE UPLOAD PREVIEW MOLECULE
// =============================================================================
// Skill Group: select + fileForUpload
// This molecule does NOT contain business logic.

import { html, svg, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
labelDefault: 'Upload files',
triggerTitle: 'Click to select files',
triggerSubtitle: 'or drag and drop here',
addMore: 'Add more files',
replaceFile: 'Replace file',
loading: 'Uploading...',
remove: 'Remove',
noPreview: 'No preview',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    labelDefault: 'Enviar arquivos',
    triggerTitle: 'Clique para selecionar arquivos',
    triggerSubtitle: 'ou arraste e solte aqui',
    addMore: 'Adicionar mais arquivos',
    replaceFile: 'Substituir arquivo',
    loading: 'Enviando...',
    remove: 'Remover',
    noPreview: 'Sem prévia',
  },
};
/// **collab_i18n_end**

@customElement('groupselectfileforupload--ml-file-upload-preview')
export class MlFileUploadPreviewMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // ==========================================================================
  // SLOT TAGS
  // ==========================================================================
  slotTags = ['Label', 'Helper', 'Trigger'];

  // ==========================================================================
  // PROPERTIES — From Contract
  // ==========================================================================
  @propertyDataSource({ type: Array })
  value: File[] = [];

  @propertyDataSource({ type: String })
  error: string = '';

  @propertyDataSource({ type: Boolean })
  multiple = false;

  @propertyDataSource({ type: String })
  accept = '';

  @propertyDataSource({ type: Number, attribute: 'max-size-kb' })
  maxSizeKb = 0;

  @propertyDataSource({ type: Number, attribute: 'max-files' })
  maxFiles = 0;

  @propertyDataSource({ type: Boolean })
  disabled = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  // ==========================================================================
  // INTERNAL STATE
  // ==========================================================================
  @state()
  private isDragging = false;

  private previewUrls: Map<string, string> = new Map();
  private uid = `ml-fup-${Math.random().toString(36).slice(2)}`;

  // ==========================================================================
  // STATE CHANGE HANDLER (derived values)
  // ==========================================================================
  handleIcaStateChange(key: string, value: any) {
    const valueAttr = this.getAttribute('value');
    if (valueAttr === `{{${key}}}`) {
      this.syncPreviewUrls(value as File[]);
    }
    this.requestUpdate();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  disconnectedCallback() {
    this.revokeAllPreviews();
    super.disconnectedCallback();
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  private handleTriggerClick() {
    if (this.disabled || this.loading) return;
    const input = this.getFileInput();
    if (input) input.click();
  }

  private handleTriggerKeydown(e: KeyboardEvent) {
    if (this.disabled || this.loading) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleTriggerClick();
    }
  }

  private handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    this.processFiles(files);
    input.value = '';
  }

  private handleDragOver(e: DragEvent) {
    if (this.disabled || this.loading) return;
    e.preventDefault();
    this.isDragging = true;
  }

  private handleDragLeave() {
    if (this.disabled || this.loading) return;
    this.isDragging = false;
  }

  private handleDrop(e: DragEvent) {
    if (this.disabled || this.loading) return;
    e.preventDefault();
    this.isDragging = false;
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    this.processFiles(files);
  }

  private handleRemoveFile(index: number) {
    if (this.disabled || this.loading) return;
    const next = this.value.filter((_, i) => i !== index);
    this.value = next;
    this.syncPreviewUrls(next);
  }

  // ==========================================================================
  // FILE PROCESSING
  // ==========================================================================
  private processFiles(files: File[]) {
    if (!files.length) return;

    const existing = this.value || [];
    const allowCount = this.multiple ? (this.maxFiles > 0 ? this.maxFiles : Infinity) : 1;
    let remaining = allowCount - existing.length;

    const accepted: File[] = [];
    const rejectedByReason: Record<'size' | 'type' | 'count', File[]> = {
      size: [],
      type: [],
      count: [],
    };

    files.forEach((file) => {
      if (remaining <= 0) {
        rejectedByReason.count.push(file);
        return;
      }
      if (!this.isAcceptedType(file)) {
        rejectedByReason.type.push(file);
        return;
      }
      if (this.maxSizeKb > 0 && file.size > this.maxSizeKb * 1024) {
        rejectedByReason.size.push(file);
        return;
      }
      accepted.push(file);
      remaining -= 1;
    });

    if (accepted.length > 0) {
      const next = this.multiple ? [...existing, ...accepted] : [accepted[0]];
      this.value = next;
      this.syncPreviewUrls(next);
    }

    (Object.keys(rejectedByReason) as Array<'size' | 'type' | 'count'>).forEach((reason) => {
      const rejected = rejectedByReason[reason];
      if (rejected.length > 0) {
        this.dispatchEvent(new CustomEvent('reject', {
          bubbles: true,
          composed: true,
          detail: { files: rejected, reason },
        }));
      }
    });
  }

  private isAcceptedType(file: File): boolean {
    if (!this.accept) return true;
    const accepted = this.accept.split(',').map((v) => v.trim()).filter(Boolean);
    if (accepted.length === 0) return true;

    return accepted.some((rule) => {
      if (rule.startsWith('.')) {
        return file.name.toLowerCase().endsWith(rule.toLowerCase());
      }
      if (rule.endsWith('/*')) {
        const base = rule.replace('/*', '');
        return file.type.startsWith(`${base}/`);
      }
      return file.type === rule;
    });
  }

  // ==========================================================================
  // PREVIEW MANAGEMENT
  // ==========================================================================
  private syncPreviewUrls(files: File[] = []) {
    const nextKeys = new Set(files.map((f) => this.getFileKey(f)));

    this.previewUrls.forEach((url, key) => {
      if (!nextKeys.has(key)) {
        URL.revokeObjectURL(url);
        this.previewUrls.delete(key);
      }
    });

    files.forEach((file) => {
      const key = this.getFileKey(file);
      if (!this.previewUrls.has(key) && file.type.startsWith('image/')) {
        this.previewUrls.set(key, URL.createObjectURL(file));
      }
    });
  }

  private revokeAllPreviews() {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls.clear();
  }

  private getFileKey(file: File): string {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  private getPreviewUrl(file: File): string | null {
    const key = this.getFileKey(file);
    return this.previewUrls.get(key) || null;
  }

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================
  private getContainerClasses(): string {
    return [
      'w-full',
      this.disabled || this.loading ? 'opacity-50' : '',
    ].filter(Boolean).join(' ');
  }

  private getDropZoneClasses(hasError: boolean): string {
    return [
      'relative w-full rounded-lg border border-dashed p-4 transition',
      'bg-white dark:bg-slate-800',
      'text-slate-900 dark:text-slate-100',
      hasError
        ? 'border-red-500 dark:border-red-400'
        : this.isDragging
          ? 'border-sky-500 dark:border-sky-400 bg-sky-50 dark:bg-sky-900/40'
          : 'border-slate-200 dark:border-slate-700',
      !this.disabled && !this.loading
        ? 'hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer'
        : 'cursor-not-allowed',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
    ].filter(Boolean).join(' ');
  }

  private getFileItemClasses(): string {
    return [
      'flex items-center gap-3 rounded-md border p-2',
      'bg-slate-50 dark:bg-slate-900',
      'border-slate-200 dark:border-slate-700',
    ].join(' ');
  }

  private getRemoveButtonClasses(): string {
    return [
      'ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition',
      'bg-white dark:bg-slate-800',
      'text-slate-600 dark:text-slate-300',
      'border border-slate-200 dark:border-slate-700',
      !this.disabled && !this.loading
        ? 'hover:bg-slate-50 dark:hover:bg-slate-700'
        : 'cursor-not-allowed',
    ].join(' ');
  }

  private formatSize(size: number): string {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    return html`
      <div id="${this.uid}-label" class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        ${unsafeHTML(this.getSlotContent('Label'))}
      </div>
    `;
  }

  private renderHelperOrError(): TemplateResult {
    if (this.error) {
      return html`
        <p id="${this.uid}-error" class="mt-2 text-xs text-red-600 dark:text-red-400">
          ${unsafeHTML(String(this.error))}
        </p>
      `;
    }
    if (this.hasSlot('Helper')) {
      return html`
        <p id="${this.uid}-helper" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          ${unsafeHTML(this.getSlotContent('Helper'))}
        </p>
      `;
    }
    return html``;
  }

  private renderTriggerContent(): TemplateResult {
    if (this.hasSlot('Trigger') && (!this.value || this.value.length === 0)) {
      return html`${unsafeHTML(this.getSlotContent('Trigger'))}`;
    }

    const title = (this.value?.length || 0) > 0
      ? (this.multiple ? this.msg.addMore : this.msg.replaceFile)
      : this.msg.triggerTitle;

    return html`
      <div class="flex flex-col items-center justify-center gap-1 text-center">
        <div class="text-sm font-medium text-slate-700 dark:text-slate-200">${title}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${this.msg.triggerSubtitle}</div>
      </div>
    `;
  }

  private renderLoadingIndicator(): TemplateResult {
    if (!this.loading) return html``;
    return html`
      <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-800/70">
        <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-200"></span>
          ${this.msg.loading}
        </div>
      </div>
    `;
  }

  private renderFileList(): TemplateResult {
    if (!this.value || this.value.length === 0) return html``;

    return html`
      <div class="mt-3 grid gap-2">
        ${this.value.map((file, index) => {
          const previewUrl = this.getPreviewUrl(file);
          return html`
            <div class="${this.getFileItemClasses()}">
              <div class="h-12 w-12 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center">
                ${previewUrl
                  ? html`<img src="${previewUrl}" alt="${file.name}" class="h-full w-full object-cover" />`
                  : html`<span class="text-[10px] text-slate-500 dark:text-slate-400">${this.msg.noPreview}</span>`
                }
              </div>
              <div class="flex flex-col">
                <span class="text-sm text-slate-700 dark:text-slate-200">${file.name}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">${this.formatSize(file.size)}</span>
              </div>
              <button
                class="${this.getRemoveButtonClasses()}"
                type="button"
                @click=${() => this.handleRemoveFile(index)}
                ?disabled=${this.disabled || this.loading}
                aria-label="${this.msg.remove}"
              >
                ${svg`
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M8 6v12"></path>
                    <path d="M16 6v12"></path>
                    <path d="M5 6l1-3h12l1 3"></path>
                  </svg>
                `}
                ${this.msg.remove}
              </button>
            </div>
          `;
        })}
      </div>
    `;
  }

  private getFileInput(): HTMLInputElement | null {
    return this.querySelector('input[type="file"]');
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    const hasError = Boolean(this.error);
    const describedBy = hasError
      ? `${this.uid}-error`
      : this.hasSlot('Helper')
        ? `${this.uid}-helper`
        : nothing;
    const labelledBy = this.hasSlot('Label') ? `${this.uid}-label` : nothing;

    return html`
      <div class="${this.getContainerClasses()}">
        ${this.renderLabel()}

        <div
          class="${this.getDropZoneClasses(hasError)}"
          role="button"
          tabindex="${this.disabled || this.loading ? -1 : 0}"
          aria-disabled="${this.disabled || this.loading}"
          aria-labelledby=${labelledBy ?? nothing}
          aria-describedby=${describedBy ?? nothing}
          aria-invalid="${hasError}"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeydown}
          @dragover=${this.handleDragOver}
          @dragleave=${this.handleDragLeave}
          @drop=${this.handleDrop}
        >
          ${this.renderTriggerContent()}
          <input
            class="hidden"
            type="file"
            accept="${this.accept}"
            ?multiple=${this.multiple}
            ?disabled=${this.disabled || this.loading}
            aria-labelledby=${labelledBy ?? nothing}
            aria-describedby=${describedBy ?? nothing}
            aria-invalid="${hasError}"
            @change=${this.handleInputChange}
          />
          ${this.renderLoadingIndicator()}
        </div>

        ${this.renderFileList()}
        ${this.renderHelperOrError()}
      </div>
    `;
  }
}
