/// <mls fileReference="_102033_/l2/molecules/groupselectmany/ml-multi-checkbox-list.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// ML MULTI CHECKBOX LIST MOLECULE
// =============================================================================
// Skill Group: select + many
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, property, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  placeholder: 'Select options',
  empty: 'No items available',
  loading: 'Loading...',
  search: 'Search...',
  viewEmpty: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    placeholder: 'Selecione opções',
    empty: 'Nenhum item disponível',
    loading: 'Carregando...',
    search: 'Buscar...',
    viewEmpty: '—',
  },
};
/// **collab_i18n_end**

interface ParsedItem {
  value: string;
  label: string;
  text: string;
  disabled: boolean;
}

interface ParsedGroup {
  label: string;
  items: ParsedItem[];
}

@customElement('groupselectmany--ml-multi-checkbox-list')
export class MlMultiCheckboxListMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;
  private uid = `ml-multi-checkbox-${Math.random().toString(36).slice(2)}`;

  // ===========================================================================
  // SLOT TAGS
  // ==========================================================================
  slotTags = ['Label', 'Helper', 'Trigger', 'Item', 'Group', 'Empty'];

  // ===========================================================================
  // PROPERTIES — From Contract
  // ==========================================================================
  @propertyDataSource({ type: String })
  value: string = '';

  @propertyDataSource({ type: String })
  error: string = '';

  @propertyDataSource({ type: String })
  name: string = '';

  @propertyDataSource({ type: String })
  placeholder: string = '';

  @propertyDataSource({ type: Boolean })
  searchable: boolean = false;

  @propertyDataSource({ type: Number, attribute: 'min-selection' })
  minSelection: number = 0;

  @propertyDataSource({ type: Number, attribute: 'max-selection' })
  maxSelection: number = 0;

  @propertyDataSource({ type: Boolean, attribute: 'is-editing' })
  isEditing: boolean = true;

  @propertyDataSource({ type: Boolean })
  disabled: boolean = false;

  @propertyDataSource({ type: Boolean })
  readonly: boolean = false;

  @propertyDataSource({ type: Boolean })
  required: boolean = false;

  @propertyDataSource({ type: Boolean })
  loading: boolean = false;

  // ===========================================================================
  // INTERNAL STATE
  // ==========================================================================
  @state()
  private searchQuery: string = '';

  @state()
  private isOpen: boolean = false;

  // ===========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  private handleFocusIn() {
    if (!this.isEditing) return;
    this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
  }

  private handleFocusOut(e: FocusEvent) {
    if (!this.isEditing) return;
    const related = e.relatedTarget as Node | null;
    if (!related || !this.contains(related)) {
      this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
    }
  }

  private handleSearchInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.searchQuery = input.value;
  }

  private handleToggleItem(item: ParsedItem) {
    if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
    if (item.disabled) return;

    const selected = this.getSelectedValues();
    const isSelected = selected.includes(item.value);
    const maxReached = this.maxSelection > 0 && selected.length >= this.maxSelection;

    if (!isSelected && maxReached) return;

    const updated = isSelected
      ? selected.filter((v) => v !== item.value)
      : [...selected, item.value];

    this.value = updated.join(',');

    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      })
    );
  }

  // ===========================================================================
  // PARSING
  // ==========================================================================
  private parseItem(el: Element): ParsedItem | null {
    const value = el.getAttribute('value');
    if (!value) return null;
    const label = el.innerHTML || '';
    const text = (el.textContent || '').trim();
    const disabled = el.hasAttribute('disabled');
    return { value, label, text, disabled };
  }

  private parseItems(): { groups: ParsedGroup[]; items: ParsedItem[] } {
    const groups: ParsedGroup[] = [];
    const groupEls = this.getSlots('Group');

    groupEls.forEach((groupEl) => {
      const label = groupEl.getAttribute('label') || '';
      const items = Array.from(groupEl.querySelectorAll('Item'))
        .map((itemEl) => this.parseItem(itemEl))
        .filter((item): item is ParsedItem => !!item);
      groups.push({ label, items });
    });

    const allItems = this.getSlots('Item');
    const standaloneItems = allItems
      .filter((itemEl) => !itemEl.closest('Group'))
      .map((itemEl) => this.parseItem(itemEl))
      .filter((item): item is ParsedItem => !!item);

    return { groups, items: standaloneItems };
  }

  private filterItems(items: ParsedItem[]): ParsedItem[] {
    if (!this.searchable || !this.searchQuery) return items;
    const query = this.searchQuery.toLowerCase();
    return items.filter((item) => item.text.toLowerCase().includes(query));
  }

  private getSelectedValues(): string[] {
    if (!this.value) return [];
    return this.value.split(',').map((v) => v.trim()).filter(Boolean);
  }

  private getSelectedLabels(allItems: ParsedItem[]): ParsedItem[] {
    const selected = new Set(this.getSelectedValues());
    return allItems.filter((item) => selected.has(item.value));
  }

  // ===========================================================================
  // RENDER HELPERS
  // ==========================================================================
  private getContainerClasses(hasError: boolean): string {
    return [
      'w-full rounded-lg border p-3 space-y-3 transition',
      'bg-white dark:bg-slate-800',
      hasError
        ? 'border-red-500 dark:border-red-400'
        : 'border-slate-200 dark:border-slate-700',
      this.disabled || this.readonly || this.loading ? 'opacity-50 cursor-not-allowed' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getItemClasses(item: ParsedItem, isSelected: boolean, isBlocked: boolean): string {
    return [
      'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition border',
      'bg-white dark:bg-slate-800',
      isSelected
        ? 'border-sky-500 dark:border-sky-400 bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
        : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
      !isSelected && !isBlocked
        ? 'hover:bg-slate-50 dark:hover:bg-slate-700'
        : '',
      isBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private renderLabel(labelId: string): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    return html`<div id=${labelId} class="text-sm font-medium text-slate-700 dark:text-slate-300">
      ${unsafeHTML(this.getSlotContent('Label'))}
    </div>`;
  }

  private renderFeedback(hasError: boolean, errorId: string): TemplateResult {
    if (!this.isEditing) return html``;
    if (this.error) {
      return html`<p id=${errorId} class="text-xs text-red-600 dark:text-red-400">
        ${unsafeHTML(String(this.error))}
      </p>`;
    }
    if (this.hasSlot('Helper')) {
      return html`<p class="text-xs text-slate-500 dark:text-slate-400">
        ${unsafeHTML(this.getSlotContent('Helper'))}
      </p>`;
    }
    return html``;
  }

  private renderCheckIcon(): TemplateResult {
    return html`<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      ${svg`<path
        fill-rule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.01 7.03a1 1 0 0 1-1.42 0L3.29 8.744a1 1 0 1 1 1.42-1.41l3.22 3.24 6.3-6.32a1 1 0 0 1 1.474.035z"
        clip-rule="evenodd"
      />`}
    </svg>`;
  }

  private renderItems(): TemplateResult {
    const { groups, items } = this.parseItems();
    const selected = new Set(this.getSelectedValues());
    const selectedCount = selected.size;
    const maxReached = this.maxSelection > 0 && selectedCount >= this.maxSelection;

    const filteredGroups = groups
      .map((group) => ({
        ...group,
        items: this.filterItems(group.items),
      }))
      .filter((group) => group.items.length > 0);

    const filteredItems = this.filterItems(items);

    const hasAnyItems = filteredGroups.some((g) => g.items.length > 0) || filteredItems.length > 0;

    if (!hasAnyItems) {
      const emptyContent = this.getSlotContent('Empty') || this.msg.empty;
      return html`<div class="text-sm text-slate-500 dark:text-slate-400">
        ${unsafeHTML(emptyContent)}
      </div>`;
    }

    return html`
      ${filteredGroups.map(
        (group) => html`
          <div class="space-y-2">
            ${group.label
              ? html`<div class="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  ${group.label}
                </div>`
              : html``}
            <div class="space-y-2">
              ${group.items.map((item) => {
                const isSelected = selected.has(item.value);
                const isBlocked =
                  this.disabled ||
                  this.readonly ||
                  this.loading ||
                  item.disabled ||
                  (maxReached && !isSelected);
                return html`
                  <button
                    type="button"
                    class=${this.getItemClasses(item, isSelected, isBlocked)}
                    role="option"
                    aria-selected=${isSelected ? 'true' : 'false'}
                    aria-disabled=${isBlocked ? 'true' : 'false'}
                    @click=${() => this.handleToggleItem(item)}
                  >
                    <span
                      class=${[
                        'flex h-4 w-4 items-center justify-center rounded border',
                        isSelected
                          ? 'border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300'
                          : 'border-slate-300 dark:border-slate-600 text-transparent',
                        isBlocked ? 'opacity-50' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      ${isSelected ? this.renderCheckIcon() : html``}
                    </span>
                    <span class="flex-1 text-left">${unsafeHTML(item.label)}</span>
                  </button>
                `;
              })}
            </div>
          </div>
        `
      )}

      ${filteredItems.length > 0
        ? html`
            <div class="space-y-2">
              ${filteredItems.map((item) => {
                const isSelected = selected.has(item.value);
                const isBlocked =
                  this.disabled ||
                  this.readonly ||
                  this.loading ||
                  item.disabled ||
                  (maxReached && !isSelected);
                return html`
                  <button
                    type="button"
                    class=${this.getItemClasses(item, isSelected, isBlocked)}
                    role="option"
                    aria-selected=${isSelected ? 'true' : 'false'}
                    aria-disabled=${isBlocked ? 'true' : 'false'}
                    @click=${() => this.handleToggleItem(item)}
                  >
                    <span
                      class=${[
                        'flex h-4 w-4 items-center justify-center rounded border',
                        isSelected
                          ? 'border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300'
                          : 'border-slate-300 dark:border-slate-600 text-transparent',
                        isBlocked ? 'opacity-50' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      ${isSelected ? this.renderCheckIcon() : html``}
                    </span>
                    <span class="flex-1 text-left">${unsafeHTML(item.label)}</span>
                  </button>
                `;
              })}
            </div>
          `
        : html``}
    `;
  }

  private renderViewMode(): TemplateResult {
    const labelId = `${this.uid}-label`;
    const { groups, items } = this.parseItems();
    const allItems = [...items, ...groups.flatMap((g) => g.items)];
    const selectedItems = this.getSelectedLabels(allItems);
    const placeholder = this.placeholder || this.msg.viewEmpty;

    return html`
      <div class="w-full space-y-2">
        ${this.renderLabel(labelId)}
        <div class="text-sm text-slate-700 dark:text-slate-300" aria-labelledby=${labelId}>
          ${selectedItems.length === 0
            ? html`<span class="text-slate-400 dark:text-slate-500">${placeholder}</span>`
            : html`${selectedItems.map(
                (item) => html`<span class="mr-2 inline-flex">${unsafeHTML(item.label)}</span>`
              )}`}
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // RENDER
  // ==========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    if (!this.isEditing) {
      return this.renderViewMode();
    }

    const labelId = `${this.uid}-label`;
    const errorId = `${this.uid}-error`;
    const selectedCount = this.getSelectedValues().length;
    const hasValidationError =
      (this.required && selectedCount === 0) ||
      (this.minSelection > 0 && selectedCount < this.minSelection);
    const hasError = Boolean(this.error) || hasValidationError;
    const placeholder = this.placeholder || this.msg.placeholder;

    return html`
      <div
        class="w-full space-y-2"
        @focusin=${this.handleFocusIn}
        @focusout=${this.handleFocusOut}
      >
        ${this.renderLabel(labelId)}

        ${this.name
          ? html`<input type="hidden" name=${this.name} .value=${this.value} />`
          : nothing}

        <div
          class=${this.getContainerClasses(hasError)}
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby=${labelId}
          aria-invalid=${hasError ? 'true' : 'false'}
          aria-required=${this.required ? 'true' : 'false'}
          aria-describedby=${hasError && this.error ? errorId : nothing}
        >
          ${this.loading
            ? html`<div class="text-sm text-slate-500 dark:text-slate-400">
                ${this.msg.loading}
              </div>`
            : html`
                ${selectedCount === 0
                  ? html`<div class="text-xs text-slate-400 dark:text-slate-500">
                      ${placeholder}
                    </div>`
                  : html``}

                ${this.searchable
                  ? html`
                      <input
                        type="text"
                        .value=${this.searchQuery}
                        placeholder=${this.msg.search}
                        class="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                        ?disabled=${this.disabled || this.readonly || this.loading}
                        @input=${this.handleSearchInput}
                      />
                    `
                  : html``}

                <div class="space-y-3" role="group">
                  ${this.renderItems()}
                </div>
              `}
        </div>

        ${this.renderFeedback(hasError, errorId)}
      </div>
    `;
  }
}
