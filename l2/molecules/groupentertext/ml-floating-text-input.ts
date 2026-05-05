/// <mls fileReference="_102033_/l2/molecules/groupentertext/ml-floating-text-input.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// ML FLOATING TEXT INPUT MOLECULE
// =============================================================================
// Skill Group: groupEnterText
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, property, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

@customElement('groupentertext--ml-floating-text-input')
export class MlFloatingTextInputMolecule extends MoleculeAuraElement {
    // ===========================================================================
    // SLOT TAGS
    // ===========================================================================
    slotTags = ['Label', 'Helper', 'Prefix', 'Suffix'];

    // ===========================================================================
    // PROPERTIES — From Contract
    // ===========================================================================
    @propertyDataSource({ type: String })
    value: string = '';

    @propertyDataSource({ type: String })
    error: string = '';

    @propertyDataSource({ type: String })
    name: string = '';

    @propertyDataSource({ type: String })
    placeholder: string = '';

    @propertyDataSource({ type: Number, attribute: 'max-length' })
    maxLength: number | null = null;

    @propertyDataSource({ type: Number, attribute: 'min-length' })
    minLength: number | null = null;

    @propertyDataSource({ type: Number, attribute: 'rows' })
    rows: number = 1;

    @propertyDataSource({ type: String })
    autocomplete: string = '';

    @propertyDataSource({ type: String, attribute: 'input-type' })
    inputType: string = 'text';

    @propertyDataSource({ type: String })
    mask: string = '';

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
    // ===========================================================================
    @state()
    private rawDisplay: string = '';

    @state()
    private isFocused: boolean = false;

    @state()
    private uid: string = `ml-floating-${Math.random().toString(36).slice(2, 9)}`;

    // ===========================================================================
    // STATE CHANGE HANDLER (derived values)
    // ===========================================================================
    handleIcaStateChange(key: string, value: any) {
        const valueAttr = this.getAttribute('value');
        const maskAttr = this.getAttribute('mask');
        const inputTypeAttr = this.getAttribute('input-type');
        if (valueAttr === `{{${key}}}` || maskAttr === `{{${key}}}` || inputTypeAttr === `{{${key}}}`) {
            this.rawDisplay = this.getMaskedDisplayValue(this.value, this.mask, this.inputType);
        }
        this.requestUpdate();
    }

    // ===========================================================================
    // LIFECYCLE
    // ===========================================================================
    updated(changedProps: Map<string, unknown>) {
        if (changedProps.has('value') || changedProps.has('mask') || changedProps.has('inputType')) {
            this.rawDisplay = this.getMaskedDisplayValue(this.value, this.mask, this.inputType);
        }
    }

    // ===========================================================================
    // EVENT HANDLERS
    // ===========================================================================
    private handleInput(e: Event) {
        if (this.disabled || this.readonly || this.loading || !this.isEditing) return;
        const input = e.target as HTMLInputElement;
        const incomingValue = input.value ?? '';

        let nextRaw = incomingValue;
        let nextDisplay = incomingValue;

        if (this.shouldUseMask()) {
            nextRaw = this.extractRawFromInput(incomingValue, this.mask);
            if (this.maxLength !== null) {
                nextRaw = nextRaw.slice(0, this.maxLength);
            }
            nextDisplay = this.applyMaskToRaw(nextRaw, this.mask);
            input.value = nextDisplay;
            this.rawDisplay = nextDisplay;
        } else {
            if (this.maxLength !== null && incomingValue.length > this.maxLength) {
                nextRaw = incomingValue.slice(0, this.maxLength);
                input.value = nextRaw;
            }
        }

        this.value = nextRaw;
        this.dispatchEvent(new CustomEvent('input', {
            bubbles: true,
            composed: true,
            detail: { value: this.value }
        }));
    }

    private handleBlur() {
        if (!this.isEditing) return;
        this.isFocused = false;
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this.value }
        }));
        this.dispatchEvent(new CustomEvent('blur', {
            bubbles: true,
            composed: true,
        }));
    }

    private handleFocus() {
        if (!this.isEditing) return;
        this.isFocused = true;
        this.dispatchEvent(new CustomEvent('focus', {
            bubbles: true,
            composed: true,
        }));
    }

    // ===========================================================================
    // MASK HELPERS
    // ===========================================================================
    private shouldUseMask(): boolean {
        return Boolean(this.mask) && this.inputType !== 'password';
    }

    private getMaskedDisplayValue(value: string, mask: string, inputType: string): string {
        if (!mask || inputType === 'password') return value ?? '';
        return this.applyMaskToRaw(value ?? '', mask);
    }

    private applyMaskToRaw(raw: string, mask: string): string {
        if (!mask) return raw;
        let result = '';
        let rawIndex = 0;
        for (let i = 0; i < mask.length; i += 1) {
            const maskChar = mask[i];
            if (this.isMaskToken(maskChar)) {
                if (rawIndex >= raw.length) break;
                result += raw[rawIndex];
                rawIndex += 1;
            } else {
                if (rawIndex > 0 && rawIndex <= raw.length) {
                    result += maskChar;
                }
            }
        }
        return result;
    }

    private extractRawFromInput(input: string, mask: string): string {
        if (!mask) return input;
        const tokens = mask.split('').filter((ch) => this.isMaskToken(ch));
        let raw = '';
        let tokenIndex = 0;
        for (let i = 0; i < input.length; i += 1) {
            if (tokenIndex >= tokens.length) break;
            const token = tokens[tokenIndex];
            const ch = input[i];
            if (this.isCharValidForToken(ch, token)) {
                raw += ch;
                tokenIndex += 1;
            }
        }
        return raw;
    }

    private isMaskToken(ch: string): boolean {
        return ch === '#' || ch === 'A' || ch === '*';
    }

    private isCharValidForToken(ch: string, token: string): boolean {
        if (token === '#') return /\d/.test(ch);
        if (token === 'A') return /[a-zA-Z]/.test(ch);
        return true;
    }

    // ===========================================================================
    // RENDER HELPERS
    // ===========================================================================
    private getLabelText(): string {
        if (this.hasSlot('Label')) {
            return this.getSlotContent('Label');
        }
        return this.placeholder || '';
    }

    private getInputPlaceholder(labelText: string): string {
        return labelText ? '' : this.placeholder;
    }

    private getViewValue(): string {
        if (this.inputType === 'password') return '••••••••';
        if (!this.value) return '—';
        if (this.shouldUseMask()) return this.getMaskedDisplayValue(this.value, this.mask, this.inputType);
        return this.value;
    }

    private renderPrefix(): TemplateResult {
        if (!this.hasSlot('Prefix')) return html``;
        return html`<div class="text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Prefix'))}</div>`;
    }

    private renderSuffix(): TemplateResult {
        if (!this.hasSlot('Suffix') && !this.loading) return html``;
        return html`
<div class="flex items-center gap-2 text-slate-600 dark:text-slate-400">
${this.hasSlot('Suffix') ? unsafeHTML(this.getSlotContent('Suffix')) : html``}
${this.loading ? html`<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-200"></span>` : html``}
</div>
`;
    }

    private renderFeedback(labelId: string): TemplateResult {
        if (!this.isEditing) return html``;
        if (this.error) {
            return html`<p id="${labelId}-error" class="mt-1 text-xs text-red-600 dark:text-red-400">${unsafeHTML(this.error)}</p>`;
        }
        if (this.hasSlot('Helper')) {
            return html`<p id="${labelId}-helper" class="mt-1 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
        }
        return html``;
    }

    private renderLabel(labelText: string, labelId: string, floating: boolean): TemplateResult {
        if (!labelText) return html``;
        const labelClasses = [
            'absolute left-3 transition-all pointer-events-none',
            floating ? 'top-1 text-xs text-slate-600 dark:text-slate-400' : 'top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500',
            this.disabled || this.loading ? 'opacity-50' : '',
        ].filter(Boolean).join(' ');
        return html`<label id="${labelId}" class="${labelClasses}">${unsafeHTML(labelText)}</label>`;
    }

    private getContainerClasses(hasLabel: boolean): string {
        return [
            'relative flex w-full items-center gap-2 rounded-md border transition',
            'bg-white dark:bg-slate-900',
            hasLabel ? 'pt-4 pb-1 px-3' : 'py-2 px-3',
            this.error ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
            !this.error ? 'focus-within:border-sky-500 dark:focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500 dark:focus-within:ring-sky-400' : '',
            this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
        ].filter(Boolean).join(' ');
    }

    private getInputClasses(): string {
        return [
            'flex-1 bg-transparent outline-none text-sm',
            'text-slate-900 dark:text-slate-100',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            this.disabled || this.loading ? 'cursor-not-allowed' : '',
            this.readonly ? 'cursor-default' : '',
        ].filter(Boolean).join(' ');
    }

    // ===========================================================================
    // RENDER
    // ===========================================================================
    render() {
        const labelText = this.getLabelText();
        const labelId = `${this.uid}-label`;

        if (!this.isEditing) {
            return html`
<div class="w-full">
${labelText ? html`<div class="mb-1 text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(labelText)}</div>` : html``}
<div class="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
${this.renderPrefix()}
<span>${this.getViewValue()}</span>
${this.renderSuffix()}
</div>
</div>
`;
        }

        const floating = this.isFocused || Boolean(this.value);
        const inputValue = this.shouldUseMask() ? this.rawDisplay : this.value;
        const inputPlaceholder = this.getInputPlaceholder(labelText);
        const inputDisabled = this.disabled || this.loading;
        const describedBy = this.error
            ? `${labelId}-error`
            : this.hasSlot('Helper') ? `${labelId}-helper` : undefined;

        return html`
<div class="w-full">
<div class="${this.getContainerClasses(Boolean(labelText))}">
${this.renderLabel(labelText, labelId, floating)}
${this.renderPrefix()}
<input
class="${this.getInputClasses()}"
type="${this.inputType}"
.value="${inputValue}"
placeholder="${inputPlaceholder}"
maxlength=${ifDefined(this.maxLength ?? undefined)}
minlength=${ifDefined(this.minLength ?? undefined)}
name="${this.name}"
autocomplete="${this.autocomplete}"
?disabled=${inputDisabled}
?readonly=${this.readonly}
?required=${this.required}
aria-labelledby=${ifDefined(labelText ? labelId : undefined)}
aria-describedby=${ifDefined(describedBy)}
aria-invalid=${this.error ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
@input=${this.handleInput}
@blur=${this.handleBlur}
@focus=${this.handleFocus}
/>
${this.renderSuffix()}
</div>
${this.renderFeedback(labelId)}
</div>
`;
    }
}
