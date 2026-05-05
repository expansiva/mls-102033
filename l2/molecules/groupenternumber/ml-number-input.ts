/// <mls fileReference="_102033_/l2/molecules/groupenternumber/ml-number-input.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// NUMBER INPUT MOLECULE
// =============================================================================
// Skill Group: enter + number
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
    loading: 'Loading...',
    empty: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
    en: message_en,
};
/// **collab_i18n_end**

let idCounter = 0;

@customElement('groupenternumber--ml-number-input')
export class MlNumberInputMolecule extends MoleculeAuraElement {
    private msg: MessageType = messages.en;
    private componentId = `ml-number-input-${++idCounter}`;

    // ==========================================================================
    // SLOT TAGS
    // ==========================================================================
    slotTags = ['Label', 'Helper', 'Prefix', 'Suffix'];

    // ==========================================================================
    // PROPERTIES — From Contract
    // ==========================================================================
    @propertyDataSource({ type: Number })
    value: number | null = null;

    @propertyDataSource({ type: String })
    error: string = '';

    @propertyDataSource({ type: String })
    name: string = '';

    @propertyDataSource({ type: Number })
    min: number | null = null;

    @propertyDataSource({ type: Number })
    max: number | null = null;

    @propertyDataSource({ type: Number })
    step: number = 1;

    @propertyDataSource({ type: Number })
    decimals: number = 0;

    @propertyDataSource({ type: String })
    locale: string = '';

    @propertyDataSource({ type: String })
    placeholder: string = '';

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

    // ==========================================================================
    // INTERNAL STATE
    // ==========================================================================
    @state()
    private rawValue: string = '';

    // ==========================================================================
    // STATE CHANGE HANDLER
    // ==========================================================================
    handleIcaStateChange(key: string, value: any) {
        const valueAttr = this.getAttribute('value');
        const localeAttr = this.getAttribute('locale');
        const decimalsAttr = this.getAttribute('decimals');

        if (valueAttr === `{{${key}}}`) {
            this.rawValue = this.value === null || this.value === undefined
                ? ''
                : this.formatToDisplay(this.value);
        }
        if (localeAttr === `{{${key}}}` || decimalsAttr === `{{${key}}}`) {
            this.rawValue = this.value === null || this.value === undefined
                ? ''
                : this.formatToDisplay(this.value);
        }
        this.requestUpdate();
    }

    // ==========================================================================
    // EVENT HANDLERS
    // ==========================================================================
    private handleInput(e: Event) {
        if (this.disabled || this.readonly || this.loading) return;
        const input = e.target as HTMLInputElement;
        this.rawValue = input.value;
        const parsed = this.parseRawValue(this.rawValue);
        this.value = parsed;
        this.emitInput();
    }

    private handleBlur() {
        this.emitBlur();
        if (this.disabled || this.readonly || this.loading) return;

        const parsed = this.parseRawValue(this.rawValue);
        if (parsed === null) {
            this.value = null;
            this.rawValue = '';
            this.emitChange();
            return;
        }

        let next = this.roundToDecimals(parsed);
        if (this.min !== null && next < this.min) next = this.min;
        if (this.max !== null && next > this.max) next = this.max;

        this.value = next;
        this.rawValue = this.formatToDisplay(next);
        this.emitChange();
    }

    private handleFocus() {
        this.emitFocus();
    }

    // ==========================================================================
    // EMITTERS
    // ==========================================================================
    private emitInput() {
        this.dispatchEvent(new CustomEvent('input', {
            bubbles: true,
            composed: true,
            detail: { value: this.value },
        }));
    }

    private emitChange() {
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this.value },
        }));
    }

    private emitBlur() {
        this.dispatchEvent(new CustomEvent('blur', {
            bubbles: true,
            composed: true,
        }));
    }

    private emitFocus() {
        this.dispatchEvent(new CustomEvent('focus', {
            bubbles: true,
            composed: true,
        }));
    }

    // ==========================================================================
    // HELPERS
    // ==========================================================================
    private getSeparators(): { group: string; decimal: string } {
        try {
            const parts = new Intl.NumberFormat(this.locale || undefined).formatToParts(1000.1);
            const group = parts.find(p => p.type === 'group')?.value || ',';
            const decimal = parts.find(p => p.type === 'decimal')?.value || '.';
            return { group, decimal };
        } catch (e) {
            return { group: ',', decimal: '.' };
        }
    }

    private parseRawValue(raw: string): number | null {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const { group, decimal } = this.getSeparators();
        let normalized = trimmed.split(group).join('');
        if (decimal !== '.') {
            normalized = normalized.split(decimal).join('.');
        }
        let cleaned = normalized.replace(/[^0-9.-]/g, '');
        if (!cleaned) return null;
        // Keep only one leading minus
        if (cleaned.includes('-')) {
            cleaned = cleaned.replace(/-/g, '');
            cleaned = `-${cleaned}`;
            if (cleaned === '-') return null;
        }
        // Keep only first decimal separator
        const parts = cleaned.split('.');
        if (parts.length > 2) {
            cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
        }
        const num = parseFloat(cleaned);
        if (isNaN(num)) return null;
        return num;
    }

    private roundToDecimals(num: number): number {
        const factor = Math.pow(10, Math.max(0, this.decimals));
        return Math.round(num * factor) / factor;
    }

    private formatToDisplay(num: number): string {
        try {
            return num.toLocaleString(this.locale || undefined, {
                minimumFractionDigits: Math.max(0, this.decimals),
                maximumFractionDigits: Math.max(0, this.decimals),
            });
        } catch (e) {
            return num.toFixed(Math.max(0, this.decimals));
        }
    }

    private getInputClasses(): string {
        return [
            'w-full flex-1 rounded-md px-3 py-2 text-sm border transition',
            'bg-white dark:bg-slate-900',
            'text-slate-900 dark:text-slate-100',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            this.error
                ? 'border-red-500 dark:border-red-400'
                : 'border-slate-200 dark:border-slate-700',
            'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
            (this.disabled || this.loading) ? 'opacity-50 cursor-not-allowed' : '',
            this.readonly ? 'cursor-default' : '',
        ].filter(Boolean).join(' ');
    }

    private getContainerClasses(): string {
        return [
            'w-full',
            (this.disabled || this.loading) ? 'opacity-50 cursor-not-allowed' : '',
        ].filter(Boolean).join(' ');
    }

    private renderLabel(labelId: string): TemplateResult {
        if (!this.hasSlot('Label')) return html``;
        return html`
<label id=${labelId} class="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Label'))}
</label>
`;
    }

    private renderHelperOrError(errorId: string, helperId: string): TemplateResult {
        if (this.error) {
            return html`
<p id=${errorId} class="mt-1 text-xs text-red-600 dark:text-red-400">
${unsafeHTML(String(this.error))}
</p>
`;
        }
        if (this.hasSlot('Helper')) {
            return html`
<p id=${helperId} class="mt-1 text-xs text-slate-500 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Helper'))}
</p>
`;
        }
        return html``;
    }

    private renderPrefix(): TemplateResult {
        if (!this.hasSlot('Prefix')) return html``;
        return html`
<span class="mr-2 text-sm text-slate-600 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Prefix'))}
</span>
`;
    }

    private renderSuffix(): TemplateResult {
        if (!this.hasSlot('Suffix')) return html``;
        return html`
<span class="ml-2 text-sm text-slate-600 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Suffix'))}
</span>
`;
    }

    private renderViewMode(): TemplateResult {
        const labelId = `${this.componentId}-label`;
        const displayValue = this.value === null || this.value === undefined
            ? this.msg.empty
            : this.formatToDisplay(this.value);

        return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel(labelId)}
<div class="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
${this.renderPrefix()}
<span>${displayValue}</span>
${this.renderSuffix()}
</div>
</div>
`;
    }

    private renderEditMode(): TemplateResult {
        if (this.rawValue === '' && this.value !== null && this.value !== undefined) {
            this.rawValue = this.formatToDisplay(this.value);
        }

        const labelId = `${this.componentId}-label`;
        const errorId = `${this.componentId}-error`;
        const helperId = `${this.componentId}-helper`;
        const describedBy = this.error
            ? errorId
            : this.hasSlot('Helper')
                ? helperId
                : undefined;

        return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel(labelId)}
<div class="flex items-center rounded-md">
${this.renderPrefix()}
<input
class="${this.getInputClasses()}"
.type=${'text'}
inputmode="decimal"
.name=${this.name || ''}
.value=${this.rawValue}
.placeholder=${this.placeholder || ''}
?disabled=${this.disabled || this.loading}
?readonly=${this.readonly}
aria-labelledby=${ifDefined(this.hasSlot('Label') ? labelId : undefined)}
aria-describedby=${ifDefined(describedBy)}
aria-invalid=${this.error ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
@input=${this.handleInput}
@blur=${this.handleBlur}
@focus=${this.handleFocus}
/>
${this.renderSuffix()}
</div>
${this.loading ? html`<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</p>` : nothing}
${this.renderHelperOrError(errorId, helperId)}
</div>
`;
    }

    // ==========================================================================
    // RENDER
    // ==========================================================================
    render() {
        const lang = this.getMessageKey(messages);
        this.msg = messages[lang];
        return this.isEditing ? this.renderEditMode() : this.renderViewMode();
    }
}
