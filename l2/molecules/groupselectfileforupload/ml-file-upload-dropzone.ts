/// <mls fileReference="_102033_/l2/molecules/groupselectfileforupload/ml-file-upload-dropzone.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// FILE UPLOAD DROPZONE MOLECULE
// =============================================================================
// Skill Group: select + fileForUpload
// This molecule does NOT contain business logic.

import { html, svg, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';


/// **collab_i18n_start**
const message_en = {
  defaultTriggerTitle: 'Drag and drop files here',
  defaultTriggerSubtitle: 'or click to select files',
  loading: 'Uploading...',
  remove: 'Remove',
  noFiles: 'No files selected',
  ariaZone: 'File upload drop zone',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    defaultTriggerTitle: 'Arraste e solte arquivos aqui',
    defaultTriggerSubtitle: 'ou clique para selecionar arquivos',
    loading: 'Enviando...',
    remove: 'Remover',
    noFiles: 'Nenhum arquivo selecionado',
    ariaZone: 'Área de upload de arquivos',
  },
};
/// **collab_i18n_end**

@customElement('groupselectfileforupload--ml-file-upload-dropzone')
export class MlFileUploadDropzoneMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;
  private inputId = `file-upload-input-${Math.random().toString(36).slice(2)}`;
  private labelId = `file-upload-label-${Math.random().toString(36).slice(2)}`;
  private errorId = `file-upload-error-${Math.random().toString(36).slice(2)}`;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Helper', 'Trigger'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: Object })
  value: File[] = [];

  @propertyDataSource({ type: String })
  error = '';

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

  // =========================================================================
  // INTERNAL STATE
  // =========================================================================
  @state()
  private isDragging = false;

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handleZoneClick() {
    if (this.disabled || this.loading) return;
    const input = this.getInputElement();
    if (input) input.click();
  }

  private handleZoneKeydown(e: KeyboardEvent) {
    if (this.disabled || this.loading) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleZoneClick();
    }
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
    const files = Array.from(e.dataTransfer?.files || []);
    this.processFiles(files);
  }

  private handleInputChange(e: Event) {
    if (this.disabled || this.loading) return;
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.processFiles(files);
    input.value = '';
  }

  private handleRemoveFile(index: number) {
    if (this.disabled || this.loading) return;
    const next = [...this.value];
    next.splice(index, 1);
    this.value = next;
  }

  // =========================================================================
  // FILE PROCESSING
  // =========================================================================
  private processFiles(files: File[]) {
    if (!files.length) return;

    const currentValue = this.multiple ? [...this.value] : [];
    const currentCount = this.multiple ? currentValue.length : 0;
    const { valid, rejects } = this.validateFiles(files, currentCount);

    rejects.forEach((r) => {
      if (r.files.length > 0) {
        this.dispatchEvent(
          new CustomEvent('reject', {
            bubbles: true,
            composed: true,
            detail: { files: r.files, reason: r.reason },
          })
        );
      }
    });

    if (!valid.length) return;

    if (this.multiple) {
      this.value = currentValue.concat(valid);
    } else {
      this.value = [valid[0]];
    }
  }

  private validateFiles(files: File[], currentCount: number): {
    valid: File[];
    rejects: Array<{ files: File[]; reason: 'size' | 'type' | 'count' }>;
  } {
    const typeRejected: File[] = [];
    const sizeRejected: File[] = [];
    const candidates: File[] = [];

    files.forEach((file) => {
      if (!this.isFileTypeAccepted(file)) {
        typeRejected.push(file);
        return;
      }
      if (this.maxSizeKb > 0 && file.size / 1024 > this.maxSizeKb) {
        sizeRejected.push(file);
        return;
      }
      candidates.push(file);
    });

    const available = this.getAvailableSlots(currentCount);
    let valid: File[] = [];
    const countRejected: File[] = [];

    if (available <= 0) {
      countRejected.push(...candidates);
    } else if (candidates.length > available) {
      valid = candidates.slice(0, available);
      countRejected.push(...candidates.slice(available));
    } else {
      valid = candidates;
    }

    return {
      valid,
      rejects: [
        { files: typeRejected, reason: 'type' },
        { files: sizeRejected, reason: 'size' },
        { files: countRejected, reason: 'count' },
      ],
    };
  }

  private getAvailableSlots(currentCount: number): number {
    if (!this.multiple) return 1;
    if (this.maxFiles > 0) return Math.max(this.maxFiles - currentCount, 0);
    return Number.POSITIVE_INFINITY;
  }

  private isFileTypeAccepted(file: File): boolean {
    const accept = (this.accept || '').trim();
    if (!accept) return true;
    const tokens = accept
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!tokens.length) return true;

    const fileName = file.name.toLowerCase();
    const fileType = (file.type || '').toLowerCase();

    return tokens.some((token) => {
      if (token.startsWith('.')) {
        return fileName.endsWith(token);
      }
      if (token.endsWith('/*')) {
        const prefix = token.replace('/*', '');
        return fileType.startsWith(prefix);
      }
      return fileType === token;
    });
  }

  private formatFileSize(size: number): string {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  private getInputElement(): HTMLInputElement | null {
    return this.querySelector(`#${this.inputId}`) as HTMLInputElement | null;
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    const hasError = !!this.error;
    const hasLabel = this.hasSlot('Label');
    const hasHelper = this.hasSlot('Helper');

    const containerClasses = [
      'w-full',
      'space-y-2',
    ].join(' ');

    const dropzoneClasses = [
      'w-full rounded-lg border border-dashed p-6 transition',
      'bg-slate-50 dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      hasError
        ? 'border-red-500 dark:border-red-400'
        : 'border-slate-200 dark:border-slate-700',
      this.isDragging
        ? 'border-sky-500 dark:border-sky-400 bg-sky-50 dark:bg-sky-900/40'
        : '',
      this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
    ].filter(Boolean).join(' ');

    return html`
      <div class=${containerClasses}>
        ${hasLabel
          ? html`<label id=${this.labelId} class="text-sm font-medium text-slate-700 dark:text-slate-300">
              ${unsafeHTML(this.getSlotContent('Label'))}
            </label>`
          : html``}

        <div
          class=${dropzoneClasses}
          role="button"
          tabindex=${this.disabled || this.loading ? '-1' : '0'}
          aria-labelledby=${hasLabel ? this.labelId : ''}
          aria-label=${hasLabel ? '' : this.msg.ariaZone}
          aria-invalid=${hasError ? 'true' : 'false'}
          aria-describedby=${hasError ? this.errorId : ''}
          @click=${this.handleZoneClick}
          @keydown=${this.handleZoneKeydown}
          @dragover=${this.handleDragOver}
          @dragleave=${this.handleDragLeave}
          @drop=${this.handleDrop}
        >
          ${this.renderTriggerContent()}
          <input
            id=${this.inputId}
            type="file"
            class="hidden"
            ?multiple=${this.multiple}
            accept=${this.accept}
            @change=${this.handleInputChange}
          />
        </div>

        ${this.renderFileList()}

        ${this.loading
          ? html`<div class="text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>`
          : html``}

        ${hasError
          ? html`<p id=${this.errorId} class="text-xs text-red-600 dark:text-red-400">
              ${unsafeHTML(String(this.error))}
            </p>`
          : hasHelper
          ? html`<p class="text-xs text-slate-500 dark:text-slate-400">
              ${unsafeHTML(this.getSlotContent('Helper'))}
            </p>`
          : html``}
      </div>
    `;
  }

  private renderTriggerContent(): TemplateResult {
    if (this.hasSlot('Trigger')) {
      return html`<div class="text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Trigger'))}</div>`;
    }

    return html`
      <div class="flex flex-col items-center gap-2 text-center">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <svg viewBox="0 0 24 24" class="h-6 w-6 text-slate-600 dark:text-slate-300" aria-hidden="true">
            ${svg`<path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 12.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1Z"/>`}
          </svg>
        </div>
        <div class="text-sm font-medium text-slate-700 dark:text-slate-200">${this.msg.defaultTriggerTitle}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${this.msg.defaultTriggerSubtitle}</div>
      </div>
    `;
  }

  private renderFileList(): TemplateResult {
    if (!this.value || this.value.length === 0) {
      return html``;
    }

    return html`
      <ul class="space-y-2">
        ${this.value.map(
          (file, index) => html`
            <li class="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
              <div class="min-w-0">
                <div class="truncate text-sm text-slate-900 dark:text-slate-100">${file.name}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">${this.formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                class="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                @click=${() => this.handleRemoveFile(index)}
                ?disabled=${this.disabled || this.loading}
              >
                ${this.msg.remove}
              </button>
            </li>
          `
        )}
      </ul>
    `;
  }
}
