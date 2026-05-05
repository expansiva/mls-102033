/// <mls fileReference="_102033_/l2/molecules/groupentertext/ml-multiline-text.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// MULTILINE TEXT MOLECULE
// =============================================================================
// Skill Group: groupEnterText (enter + text)
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

@customElement('groupentertext--ml-multiline-text')
export class MultilineTextMolecule extends MoleculeAuraElement {
    // ==========================================================================
    // SLOT TAGS
    // ==========================================================================
    slotTags = ['Label', 'Helper', 'Prefix', 'Suffix'];

    // ==========================================================================
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

    @propertyDataSource({ type: Number, attribute: 'max-length' })
    maxLength: number | null = null;

    @propertyDataSource({ type: Number, attribute: 'min-length' })
    minLength: number | null = null;

    @propertyDataSource({ type: Number })
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

    // ==========================================================================
    // INTERNAL STATE
    // ==========================================================================
    @state()
    private rawDisplay: string = '';

    private labelId = `mlt-label-${Math.random().toString(36).slice(2)}`;
    private inputId = `mlt-input-${Math.random().toString(36).slice(2)}`;
    private helperId = `mlt-helper-${Math.random().toString(36).slice(2)}`;
    private errorId = `mlt-error-${Math.random().toString(36).slice(2)}`;

    // ==========================================================================
    // LIFECYCLE
    // ==========================================================================
    firstUpdated() {
        this.syncRawDisplay();
    }

    // ==========================================================================
    // STATE CHANGE HANDLER
    // ==========================================================================
    handleIcaStateChange(key: string, value: any) {
        const valueAttr = this.getAttribute('value');
        const maskAttr = this.getAttribute('mask');
        const rowsAttr = this.getAttribute('rows');
        const inputTypeAttr = this.getAttribute('input-type');
        if (
            valueAttr === `{{${key}}}` ||
            maskAttr === `{{${key}}}` ||
            rowsAttr === `{{${key}}}` ||
            inputTypeAttr === `{{${key}}}`
        ) {
            this.syncRawDisplay();
        }
        this.requestUpdate();
    }

    // ==========================================================================
    // HELPERS
    // ==========================================================================
    private isMaskActive(): boolean {
        return Boolean(this.mask && this.mask.length > 0 && this.rows === 1);
    }

    private shouldRenderTextarea(): boolean {
        return this.rows > 1;
    }

    private normalizeValue(value: string | null | undefined): string {
        return value ?? '';
    }

    private syncRawDisplay(): void {
        const currentValue = this.normalizeValue(this.value);
        if (this.inputType === 'password') {
            this.rawDisplay = '';
            return;
        }
        if (this.isMaskActive()) {
            this.rawDisplay = this.applyMaskToRaw(currentValue, this.mask);
        } else {
            this.rawDisplay = currentValue;
        }
    }

    private applyMaxLength(raw: string): string {
        if (this.maxLength === null || this.maxLength === undefined) return raw;
        return raw.slice(0, this.maxLength);
    }

    private getRawFromInput(input: string, mask: string): string {
        const tokens = mask.split('').filter((ch) => ch === '#' || ch === 'A' || ch === '*');
        let raw = '';
        let tokenIndex = 0;
        for (let i = 0; i < input.length; i += 1) {
            if (tokenIndex >= tokens.length) break;
            const token = tokens[tokenIndex];
            const char = input[i];
            if (this.matchToken(token, char)) {
                raw += char;
                tokenIndex += 1;
            }
        }
        return raw;
    }

    private matchToken(token: string, char: string): boolean {
        if (token === '#') return /[0-9]/.test(char);
        if (token === 'A') return /[A-Za-z]/.test(char);
        return char.length > 0;
    }

    private applyMaskToRaw(raw: string, mask: string): string {
        let result = '';
        let rawIndex = 0;
        for (let i = 0; i < mask.length; i += 1) {
            const m = mask[i];
            const isToken = m === '#' || m === 'A' || m === '*';
            if (isToken) {
                if (rawIndex >= raw.length) break;
                result += raw[rawIndex];
                rawIndex += 1;
            } else if (rawIndex > 0) {
                result += m;
            }
        }
        return result;
    }

    private getDisplayValue(): string {
        if (!this.isEditing) {
            if (this.inputType === 'password') return '••••••••';
            const value = this.normalizeValue(this.value);
            return value === '' ? '—' : value;
        }
        if (this.inputType === 'password') return this.normalizeValue(this.value);
        if (this.isMaskActive()) return this.rawDisplay;
        return this.normalizeValue(this.value);
    }

    private getWrapperClasses(hasError: boolean): string {
        return [
            'flex items-stretch gap-2 w-full rounded-lg border px-3 py-2 transition',
            'bg-white dark:bg-slate-900',
            'focus-within:ring-2 focus-within:ring-sky-500 dark:focus-within:ring-sky-400',
            hasError ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
            this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : '',
            this.readonly ? 'bg-slate-50 dark:bg-slate-800' : '',
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

    private getLabelClasses(): string {
        return 'mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400';
    }

    private getHelperClasses(): string {
        return 'mt-1 text-xs text-slate-500 dark:text-slate-400';
    }

    private getErrorClasses(): string {
        return 'mt-1 text-xs text-red-600 dark:text-red-400';
    }

    private renderLabel(): TemplateResult {
        if (!this.hasSlot('Label')) return html``;
        return html`<label id=${this.labelId} class=${this.getLabelClasses()} for=${this.inputId}>
${unsafeHTML(this.getSlotContent('Label'))}
</label>`;
    }

    private renderPrefix(): TemplateResult {
        if (!this.hasSlot('Prefix')) return html``;
        return html`<div class="flex items-center text-slate-500 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Prefix'))}
</div>`;
    }

    private renderSuffix(): TemplateResult {
        if (!this.hasSlot('Suffix')) return html``;
        return html`<div class="flex items-center text-slate-500 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Suffix'))}
</div>`;
    }

    private renderLoading(): TemplateResult {
        if (!this.loading) return html``;
        return html`<div class="ml-2 flex items-center">
<span class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-200"></span>
</div>`;
    }

    private renderHelperOrError(): TemplateResult {
        if (this.error) {
            return html`<p id=${this.errorId} class=${this.getErrorClasses()}>${unsafeHTML(String(this.error))}</p>`;
        }
        if (this.hasSlot('Helper')) {
            return html`<p id=${this.helperId} class=${this.getHelperClasses()}>${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
        }
        return html``;
    }

    private renderCounter(): TemplateResult {
        const isMultiline = this.shouldRenderTextarea();
        const hasMax = this.maxLength !== null && this.maxLength !== undefined;
        if (!isMultiline || !hasMax) return html``;
        const count = this.normalizeValue(this.value).length;
        return html`<p class="mt-1 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
${count} / ${this.maxLength}
</p>`;
    }

    // ==========================================================================
    // EVENT HANDLERS
    // ==========================================================================
    private handleInput(e: Event): void {
        if (this.disabled || this.readonly || this.loading || !this.isEditing) return;
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        const inputValue = target.value || '';

        if (this.shouldRenderTextarea()) {
            let next = inputValue;
            if (this.maxLength !== null && this.maxLength !== undefined) {
                next = next.slice(0, this.maxLength);
                if (next !== inputValue) target.value = next;
            }
            this.value = next;
            this.dispatchEvent(new CustomEvent('input', {
                bubbles: true,
                composed: true,
                detail: { value: this.value },
            }));
            return;
        }

        if (this.isMaskActive()) {
            const raw = this.getRawFromInput(inputValue, this.mask);
            const limitedRaw = this.applyMaxLength(raw);
            const masked = this.applyMaskToRaw(limitedRaw, this.mask);
            this.rawDisplay = masked;
            this.value = limitedRaw;
            if (target.value !== masked) target.value = masked;
        } else {
            let next = inputValue;
            if (this.maxLength !== null && this.maxLength !== undefined) {
                next = next.slice(0, this.maxLength);
                if (next !== inputValue) target.value = next;
            }
            this.value = next;
        }

        this.dispatchEvent(new CustomEvent('input', {
            bubbles: true,
            composed: true,
            detail: { value: this.value },
        }));
    }

    private handleBlur(): void {
        if (!this.isEditing) return;
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this.value },
        }));
        this.dispatchEvent(new CustomEvent('blur', {
            bubbles: true,
            composed: true,
        }));
    }

    private handleFocus(): void {
        if (!this.isEditing) return;
        this.dispatchEvent(new CustomEvent('focus', {
            bubbles: true,
            composed: true,
        }));
    }

    // ==========================================================================
    // RENDER
    // ==========================================================================
    render() {
        return this.isEditing ? this.renderEditMode() : this.renderViewMode();
    }

    private renderViewMode(): TemplateResult {
        const displayValue = this.getDisplayValue();
        return html`
<div class="w-full">
${this.renderLabel()}
<div class="flex items-center gap-2">
${this.renderPrefix()}
<div class="text-sm text-slate-900 dark:text-slate-100">${displayValue}</div>
${this.renderSuffix()}
</div>
</div>
`;
    }

    private renderEditMode(): TemplateResult {
        const hasError = Boolean(this.error);
        const isMultiline = this.shouldRenderTextarea();
        const describedBy = hasError
            ? this.errorId
            : this.hasSlot('Helper')
                ? this.helperId
                : undefined;
        const maxLengthAttr = this.maxLength !== null && this.maxLength !== undefined && !this.isMaskActive()
            ? this.maxLength
            : undefined;

        return html`
<div class="w-full">
${this.renderLabel()}
<div class=${this.getWrapperClasses(hasError)}>
${this.renderPrefix()}
${isMultiline
                ? html`<textarea
id=${this.inputId}
class=${this.getInputClasses()}
rows=${this.rows}
.name=${this.name}
.placeholder=${this.placeholder}
.value=${this.getDisplayValue()}
?disabled=${this.disabled || this.loading}
?readonly=${this.readonly}
?required=${this.required}
maxlength=${ifDefined(maxLengthAttr)}
aria-labelledby=${ifDefined(this.hasSlot('Label') ? this.labelId : undefined)}
aria-describedby=${ifDefined(describedBy)}
aria-invalid=${hasError ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
@input=${this.handleInput}
@blur=${this.handleBlur}
@focus=${this.handleFocus}
></textarea>`
                : html`<input
id=${this.inputId}
class=${this.getInputClasses()}
type=${this.inputType}
.name=${this.name}
.placeholder=${this.placeholder}
.value=${this.getDisplayValue()}
autocomplete=${this.autocomplete}
?disabled=${this.disabled || this.loading}
?readonly=${this.readonly}
?required=${this.required}
maxlength=${ifDefined(maxLengthAttr)}
aria-labelledby=${ifDefined(this.hasSlot('Label') ? this.labelId : undefined)}
aria-describedby=${ifDefined(describedBy)}
aria-invalid=${hasError ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
@input=${this.handleInput}
@blur=${this.handleBlur}
@focus=${this.handleFocus}
/>`}
${this.renderSuffix()}
${this.renderLoading()}
</div>
${this.renderCounter()}
${this.renderHelperOrError()}
</div>
`;
    }
}
