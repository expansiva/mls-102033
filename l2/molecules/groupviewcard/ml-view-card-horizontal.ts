/// <mls fileReference="_102033_/l2/molecules/groupviewcard/ml-view-card-horizontal.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// VIEW CARD HORIZONTAL MOLECULE
// =============================================================================
// Skill Group: view + card
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

@customElement('groupviewcard--ml-view-card-horizontal')
export class ViewCardHorizontalMolecule extends MoleculeAuraElement {
  // ===========================================================================
  // SLOT TAGS
  // ===========================================================================
  slotTags = ['CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter', 'CardAction'];

  // ===========================================================================
  // PROPERTIES — From Contract
  // ===========================================================================
  @propertyDataSource({ type: Boolean })
  clickable = false;

  @propertyDataSource({ type: Boolean })
  selected = false;

  @propertyDataSource({ type: Boolean })
  disabled = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  @propertyDataSource({ type: Boolean, attribute: 'is-editing' })
  isEditing = false;

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================
  updated() {
    this.applyEditingAttribute();
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================
  private handleCardClick() {
    if (!this.clickable || this.disabled || this.loading) return;
    this.dispatchEvent(new CustomEvent('cardClick', {
      bubbles: true,
      composed: true,
      detail: {},
    }));
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.clickable || this.disabled || this.loading) return;
    const key = e.key;
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      this.handleCardClick();
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================
  private applyEditingAttribute() {
    const nodes = this.querySelectorAll('*');
    nodes.forEach((el) => {
      if (this.isEditing) {
        el.setAttribute('is-editing', 'true');
      } else {
        el.removeAttribute('is-editing');
      }
    });
  }

  private getContainerClasses(): string {
    return [
      'w-full rounded-lg border p-4 flex gap-4 items-start transition',
      'bg-white dark:bg-slate-800',
      'text-slate-900 dark:text-slate-100',
      this.selected
        ? 'border-sky-500 dark:border-sky-400'
        : 'border-slate-200 dark:border-slate-700',
      this.clickable && !this.disabled
        ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400'
        : '',
      this.disabled ? 'opacity-50 cursor-not-allowed' : '',
    ].filter(Boolean).join(' ');
  }

  private renderHeader(): TemplateResult {
    const hasTitle = this.hasSlot('CardTitle');
    const hasDescription = this.hasSlot('CardDescription');
    const hasHeader = this.hasSlot('CardHeader');

    if (!hasHeader && !hasTitle && !hasDescription) {
      return html``;
    }

    const headerContent = this.getSlotContent('CardHeader');
    return html`
      <div class="mb-2">
        ${hasTitle
          ? html`<div class="text-sm font-semibold text-slate-900 dark:text-slate-100">${unsafeHTML(this.getSlotContent('CardTitle'))}</div>`
          : ''}
        ${hasDescription
          ? html`<div class="mt-1 text-xs text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('CardDescription'))}</div>`
          : ''}
        ${!hasTitle && !hasDescription && hasHeader
          ? html`<div class="text-sm text-slate-900 dark:text-slate-100">${unsafeHTML(headerContent)}</div>`
          : ''}
      </div>
    `;
  }

  private renderContentLeft(): TemplateResult {
    if (!this.hasSlot('CardContent')) return html``;
    return html`
      <div class="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900">
        ${unsafeHTML(this.getSlotContent('CardContent'))}
      </div>
    `;
  }

  private renderFooter(): TemplateResult {
    if (!this.hasSlot('CardFooter')) return html``;
    return html`
      <div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
        ${unsafeHTML(this.getSlotContent('CardFooter'))}
      </div>
    `;
  }

  private renderAction(): TemplateResult {
    if (!this.hasSlot('CardAction')) return html``;
    return html`
      <div class="mt-3">
        ${unsafeHTML(this.getSlotContent('CardAction'))}
      </div>
    `;
  }

  private renderSkeleton(): TemplateResult {
    return html`
      <div class="w-full rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex gap-4 items-start bg-white dark:bg-slate-800 animate-pulse">
        <div class="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
        <div class="flex-1 min-w-0">
          <div class="h-4 w-2/3 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div class="mt-2 h-3 w-4/5 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div class="mt-3 h-3 w-1/3 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================
  render() {
    if (this.loading) {
      return this.renderSkeleton();
    }

    const role = this.clickable && !this.disabled ? 'button' : undefined;
    const tabIndex = this.clickable && !this.disabled ? 0 : undefined;

    return html`
      <div
        class="${this.getContainerClasses()}"
        role=${role || ''}
        tabindex=${tabIndex ?? ''}
        aria-selected=${this.selected ? 'true' : 'false'}
        aria-disabled=${this.disabled ? 'true' : 'false'}
        @click=${this.handleCardClick}
        @keydown=${this.handleKeyDown}
      >
        ${this.renderContentLeft()}
        <div class="flex-1 min-w-0">
          ${this.renderHeader()}
          ${this.renderFooter()}
          ${this.renderAction()}
        </div>
      </div>
    `;
  }
}
