/// <mls fileReference="_102033_/l2/studio/classPickerPanel.ts" enhancement="_blank" />
// The in-place picker's panel, as a web component (TASK-102033-picker-web-component).
//
// WHY A COMPONENT
// It used to be `innerHTML` + event delegation + a global `<style>`, built inside studioEditor. That
// cost an `escapeHtml` on every interpolation, spread the UI state (tab, screen, open inputs) through
// the editor, and left 170 sentences hardcoded in Portuguese in a module that also does anchoring and
// persistence. As a component: Lit escapes by construction, the UI state is `@state`, the css is
// scoped, and the words come from the catalog (studioMessages).
//
// THE SPLIT WITH THE EDITOR
// The editor stays the brain — selection, structural anchoring, writing to the model, live update. The
// panel owns the VOCABULARY and the UI: it computes the new class attribute with the pure core and
// emits it. Nothing here knows what a Monaco model is.
//
//   editor --(target/builtClasses/dsRoles/jitLive)--> <cbe--class-picker-102033>
//          <--(picker-apply | picker-preview | picker-close)--
//
// SHADOW DOM on purpose: this is tool chrome living inside the CLIENT's page. The old code avoided
// leaking with an `se-` prefix on every selector; the shadow root removes the problem instead.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  ADD_GROUPS,
  ANIMATION_GROUPS,
  CASCADE_MAX_CHILDREN,
  CASCADE_STEPS,
  activeAnimationGroups,
  activeAnimations,
  animationOption,
  animationScreen,
  applyAnimationCustom,
  applyAnimationGroup,
  applyAnimationOption,
  applyAnimationState,
  applyCascade,
  applyTypedValue,
  addUtility,
  addableProperties,
  addableProperty,
  buildAnimationClass,
  chipAvailability,
  classesInCategories,
  colorOf,
  diffLiterals,
  newRoleOptions,
  pasteCategories,
  pasteStyle,
  readAnimationCustom,
  readAnimationState,
  readCascade,
  readTypedValue,
  removeAnimationCustom,
  removeCascade,
  removeUtility,
  replaceUtility,
  typedValueSpec,
  roleLabel,
  roleVar,
  splitUtilities,
  utilityLabel,
  utilityOptions,
  type AddGroup,
  type AnimationScreen,
  type AnimationStateKey,
  type IAddableProperty,
  type ITypedValueSpec,
  type IAnimationGroup,
  type IAnimationOption,
  type IAnimationState,
  type IUtilityToken,
} from '/_102033_/l2/studio/studioClassEdit.js';
import { t, tr, type IMessageRef } from '/_102033_/l2/studio/studioMessages.js';

export const CLASS_PICKER_TAG = 'cbe--class-picker-102033';

/** What the editor knows about the selection and the panel needs to render it. */
export interface IPickerTarget {
  /** Tag of the selected element, for the header. */
  tag: string;
  /** File that receives the edit, already formatted for display. */
  fileLabel: string;
  /** The element's class attribute — the panel's whole input. */
  literal: string;
  /** False when the anchor could not be resolved: everything is read-only. */
  editable: boolean;
  refusal?: IMessageRef;
  warning?: IMessageRef;
  /** Element children of the selection — the cascade row needs to know. */
  childCount: number;
  /**
   * Whether the element can still be found with NO classes at all.
   *
   * True for a structural anchor (its position in the template identifies it); false when the editor
   * had to fall back to COUNTING the literal in the source, because there the literal is the address
   * and an element without one could not be reached again — not even to put a class back.
   */
  canRemoveLast: boolean;
  /**
   * What the undo/redo buttons would undo and redo, already translated; empty when there is nothing.
   *
   * The stack lives in the editor (it covers text edits too, which never pass through this panel), so
   * the panel only shows what it is told.
   */
  undo: string;
  redo: string;
}

/** What the panel asks the editor to write. */
export interface IPickerApply {
  literal: string;
  /** Already-translated description for the status line (it mixes class names and words). */
  what: string;
}

/** What the panel asks the editor to SHOW for a moment, without writing anything. */
export interface IPickerPreview {
  /** An animation option: shown, replayed if it is an entrance, and undone on its own. */
  option?: string;
  /** A whole class attribute — what a paste would produce. Held while the pointer stays. */
  literal?: string;
}

/**
 * The copied style, held BETWEEN selections.
 *
 * Session-only and panel-only: no system clipboard (pasting across tabs or machines opens a format
 * question this gesture does not need) and no persistence.
 */
export interface IStyleClipboard {
  literal: string;
  /** Tag it came from, for the label. A name only — the element itself may be long gone. */
  tag: string;
}

@customElement(CLASS_PICKER_TAG)
export class ClassPickerPanel extends LitElement {
  @property({ attribute: false }) target?: IPickerTarget;
  /** Classes with a rule in the BUILT css — what the client will actually render. */
  @property({ attribute: false }) builtClasses: Set<string> = new Set<string>();
  @property({ attribute: false }) dsRoles: string[] = [];
  @property({ attribute: false }) resolveVar: (cssVar: string) => string = () => '';
  @property({ type: Boolean }) jitLive = false;

  @state() private tab: 'classes' | 'animations' = 'classes';
  @state() private screen: AnimationScreen = 'root';
  /** Group whose "custom value" input is open. */
  @state() private customEditing: string | null = null;
  /** Token index whose role palette is expanded. */
  @state() private roleEditing: number | null = null;
  /**
   * Switches flipped before anything was applied.
   *
   * The animation state is READ from the class attribute, so with nothing applied yet a switch would
   * snap back on the next render ("no mouse" → "sempre"). Dropped when the selection changes.
   */
  @state() private pendingState: Partial<IAnimationState> = {};
  /**
   * The copied style. Deliberately NOT dropped when the selection changes — copying on one element
   * and pasting on another is the whole gesture.
   */
  @state() private clipboard: IStyleClipboard | null = null;
  /** Hold this element's place instead of taking the source's (see the paste block). */
  @state() private keepPlace = false;
  /** Group of the "+" whose properties are showing. */
  @state() private addGroup: AddGroup | null = null;
  /** Property whose design-system palette is open in the "+" (colour does not seed a value). */
  @state() private addColor: string | null = null;
  /** Token index whose typed-value input is open. */
  @state() private typedEditing: number | null = null;

  static styles = css`
    :host {
      /* FIXED, not absolute: absolute inside the service element anchors the bottom edge to the end
         of the whole scrollable content, so on a page with scroll the panel sat below the fold. The
         editor re-pins it to the visible part of the app region on every scroll (positionChrome). */
      position: fixed; bottom: 12px; right: 12px;
      z-index: 99992;
      width: 340px; max-width: calc(100% - 24px);
      max-height: 55%; overflow: auto;
      background: #1f2933; color: #f5f7fa;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      font-family: "Segoe UI", sans-serif; font-size: 12px;
    }
    :host([hidden]) { display: none; }

    .head {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(245,247,250,0.12);
      position: sticky; top: 0; background: #1f2933;
    }
    .tag { font-family: monospace; color: #7fb3ff; }
    .file { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #b8c2cc; }
    .close { background: transparent; border: 0; color: #b8c2cc; font-size: 16px; line-height: 1; cursor: pointer; }
    .history {
      flex: 0 0 auto; background: transparent; border: 0; cursor: pointer;
      color: #b8c2cc; font-size: 14px; line-height: 1; padding: 0 2px;
    }
    .history:hover:not([disabled]) { color: #f5f7fa; }
    .history[disabled] { opacity: 0.3; cursor: default; }

    .tabs { display: flex; gap: 2px; padding: 6px 8px 0; border-bottom: 1px solid rgba(245,247,250,0.12); }
    .tab {
      background: transparent; border: 0; cursor: pointer; color: #9aa5b1; font-size: 12px;
      padding: 4px 8px; border-radius: 4px 4px 0 0; border-bottom: 2px solid transparent;
    }
    .tab:hover { color: #e6edf3; }
    .tab.active { color: #f5f7fa; border-bottom-color: #4287f5; }

    .note { padding: 6px 10px; border-bottom: 1px solid rgba(245,247,250,0.08); color: #cbd5e1; line-height: 1.35; }
    .note.warning { background: rgba(245,166,35,0.14); color: #ffd8a1; }
    .note.refusal { background: rgba(229,57,53,0.16); color: #ffc9c7; }

    /* One group has to read as one group: the room below the chips is what separates it from the
       next label, and the rule is only there to help — space does the work. */
    .rows { padding: 4px 4px 10px; }
    .block { display: block; padding: 9px 6px; }
    .block + .block { border-top: 1px solid rgba(245,247,250,0.10); }
    .block.readonly { opacity: 0.75; }
    .label {
      display: block; margin-bottom: 6px; color: #b8c2cc; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .reason { display: block; margin-top: 4px; color: #9aa5b1; line-height: 1.3; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }

    /* The "+" is not another property of the element: it is the end of the list. */
    .block.add { margin-top: 6px; border-top-color: rgba(245,247,250,0.18); }

    .chip {
      font-family: monospace; font-size: 11px; padding: 2px 6px; cursor: pointer;
      color: #e6edf3; background: rgba(245,247,250,0.08);
      border: 1px solid rgba(245,247,250,0.18); border-radius: 3px;
    }
    .chip:hover:not([disabled]) { background: rgba(66,135,245,0.35); }
    .chip.current { background: #4287f5; border-color: #4287f5; color: #fff; cursor: default; }
    .chip[disabled]:not(.current) { opacity: 0.45; cursor: not-allowed; }
    .chip.jit { border-style: dashed; }
    .chip.more { letter-spacing: 1px; padding: 2px 8px; }
    .star { color: #ffd8a1; }

    .crumb { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid rgba(245,247,250,0.08); }
    .here { color: #f5f7fa; }
    .link { background: transparent; border: 0; cursor: pointer; color: #7fb3ff; font-size: 12px; padding: 0; }
    .link:hover { text-decoration: underline; }
    .advanced { display: block; margin: 6px 6px 2px; }

    .switch { display: flex; align-items: center; gap: 6px; padding: 8px 6px 2px; color: #9aa5b1; cursor: pointer; }
    .switch input { cursor: pointer; }
    .hint { display: block; padding: 0 8px 6px 24px; color: #8a94a0; font-size: 10px; line-height: 1.4; }

    .custom { display: inline-flex; align-items: center; gap: 4px; }
    .custom input {
      width: 68px; padding: 2px 4px; font-family: monospace; font-size: 11px;
      color: #e6edf3; background: #2c3742;
      border: 1px solid rgba(245,247,250,0.25); border-radius: 3px;
    }
    .unit { color: #9aa5b1; font-size: 11px; }

    /* The role palette: a swatch, the name, the value — expanded inline. */
    .swatch {
      flex: 0 0 auto; width: 12px; height: 12px; border-radius: 2px;
      /* The border is what makes #ffffff visible on a dark panel. */
      border: 1px solid rgba(245,247,250,0.35);
    }
    .swatch.empty {
      border-style: dashed;
      background: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(245,247,250,0.25) 3px, rgba(245,247,250,0.25) 4px);
    }
    .role-btn, .role-item {
      display: flex; align-items: center; gap: 6px; width: 100%;
      padding: 3px 6px; cursor: pointer; text-align: left;
      font-family: inherit; font-size: 11px; color: #e6edf3;
      background: rgba(245,247,250,0.08);
      border: 1px solid rgba(245,247,250,0.18); border-radius: 3px;
    }
    .role-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
    .role-item { background: transparent; border-color: transparent; border-radius: 0; }
    .role-item:hover { background: rgba(66,135,245,0.28); }
    .role-item.current { background: rgba(66,135,245,0.18); }
    .role-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role-value { flex: 0 0 auto; font-family: monospace; color: #9aa5b1; }
    .head-row { display: flex; align-items: baseline; gap: 6px; }
    .head-row .label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .remove {
      flex: 0 0 auto; background: transparent; border: 0; cursor: pointer;
      color: #9aa5b1; font-size: 13px; line-height: 1; padding: 0 2px;
    }
    .remove:hover:not([disabled]) { color: #fca5a5; }
    .remove[disabled] { opacity: 0.3; cursor: not-allowed; }

    /* Copy/paste of a style */
    .copy {
      flex: 0 0 auto; background: transparent; border: 0; cursor: pointer;
      color: #7fb3ff; font-family: inherit; font-size: 11px; padding: 0;
    }
    .copy:hover { text-decoration: underline; }
    .block.paste { background: rgba(66,135,245,0.10); }
    .paste-actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .paste-actions .link { margin-left: auto; }
    .diff-row { display: flex; gap: 6px; align-items: baseline; margin-top: 4px; }
    .dir {
      flex: 0 0 34px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .dir.in { color: #86efac; }
    .dir.out { color: #fca5a5; }
    .toks { display: flex; flex-wrap: wrap; gap: 3px; }
    .tok {
      font-family: monospace; font-size: 10px; padding: 1px 4px; border-radius: 3px;
      background: rgba(245,247,250,0.08); color: #e6edf3;
    }
    .tok.out { text-decoration: line-through; opacity: 0.7; }
    /* Place is the one thing a paste may legitimately have to hold back — so it is never silent. */
    .tok.place { outline: 1px dashed rgba(245,166,35,0.85); }

    .role-list {
      display: block; width: 100%; margin-top: 2px; max-height: 190px; overflow: auto;
      border: 1px solid rgba(245,247,250,0.18); border-radius: 3px; background: #232e39;
    }
  `;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected willUpdate(changed: Map<string, unknown>): void {
    // A new selection drops what belonged to the previous one: a switch nobody applied yet, and any
    // expanded list, which would otherwise open on an element that never asked for it.
    const previous = changed.get('target') as IPickerTarget | undefined;
    if (changed.has('target') && previous && previous.literal !== this.target?.literal) {
      this.customEditing = null;
      this.typedEditing = null;
      // The "+" is answered by what the element already has, and that just changed.
      this.addGroup = null;
      this.addColor = null;
    }
    if (changed.has('target') && previous?.tag !== this.target?.tag) {
      this.pendingState = {};
      this.roleEditing = null;
    }
  }

  render() {
    const target = this.target;
    if (!target) return nothing;

    return html`
      <div class="head">
        <span class="tag">${target.tag}</span>
        ${this.historyButton('undo')}
        ${this.historyButton('redo')}
        <span class="file" title=${t('panel.fileTitle')}>${target.fileLabel || t('panel.noFile')}</span>
        <button type="button" class="copy" title=${t('panel.copyStyleTitle')}
          @click=${this.onCopy}>${t('panel.copyStyle')}</button>
        <button type="button" class="close" title=${t('panel.close')} @click=${this.onClose}>&times;</button>
      </div>
      <div class="tabs">
        ${this.tabButton('classes', 'panel.tabClasses')}
        ${this.tabButton('animations', 'panel.tabAnimations')}
      </div>
      ${target.refusal ? html`<div class="note refusal">${tr(target.refusal)}</div>` : nothing}
      ${target.warning ? html`<div class="note warning">${tr(target.warning)}</div>` : nothing}
      ${this.tab === 'animations' ? this.renderAnimations() : this.renderClasses()}
    `;
  }

  /**
   * Undo or redo, with the name of what it would do in the tooltip.
   *
   * Disabled is the honest state when the stack is empty — and the shortcut (Ctrl+Z) does the same
   * thing, so this is a reminder as much as a button.
   */
  private historyButton(direction: 'undo' | 'redo') {
    const what = (direction === 'undo' ? this.target?.undo : this.target?.redo) ?? '';
    return html`<button type="button" class="history" ?disabled=${!what}
      title=${what ? t(`panel.${direction}Of`, { what }) : t(`panel.${direction}`)}
      @click=${() => this.dispatchEvent(new CustomEvent(`picker-${direction}`, { bubbles: true, composed: true }))}
    >${direction === 'undo' ? '\u21B6' : '\u21B7'}</button>`;
  }

  private tabButton(id: 'classes' | 'animations', label: string) {
    return html`<button type="button" class="tab ${this.tab === id ? 'active' : ''}"
      @click=${() => { this.tab = id; this.preview(null); }}>${t(label)}</button>`;
  }

  // ─── Classes tab ───────────────────────────────────────────────────────────

  /**
   * The tab: what the element has, and what it could have.
   *
   * An element with NO class is not a dead end — it is exactly where the "+" earns its place. The
   * editor anchors it by position alone and the first write inserts the attribute, so the only
   * difference here is the line that says there is nothing yet.
   */
  private renderClasses() {
    const tokens = splitUtilities(this.target?.literal ?? '');
    return html`<div class="rows">
      ${this.renderPaste()}
      ${tokens.length
    ? tokens.map((token) => this.renderClassBlock(token))
    : html`<div class="block readonly"><span class="reason">${t('panel.noClasses')}</span></div>`}
      ${this.renderAdd()}
    </div>`;
  }

  /**
   * One block per class token: what it edits on its own line, the neighbours below.
   *
   * The label is the PROPERTY, not the class: `bg-[var(--button-secondary-bg,#f8fafc)]` says what is
   * written, "background colour" says what the row does. The class itself is the tooltip, and it stays
   * the label when there is no honest name for the family — showing the class beats inventing a name.
   */
  private renderClassBlock(token: IUtilityToken) {
    const options = utilityOptions(token, 2, this.dsRoles, (cssVar) => this.resolveVar(cssVar));
    const label = utilityLabel(token);
    const text = label.property
      ? [t(label.property), ...label.variants.map((part) => (part.id ? t(part.id, part.params) : part.raw ?? ''))].join(' · ')
      : token.raw;

    const head = html`<span class="head-row">
      <span class="label" title=${token.raw}>${text}</span>
      ${this.removeButton(token, text)}
    </span>`;

    if (options.kind === 'none') {
      return html`<div class="block readonly">${head}<span class="reason">${tr(options.reason)}</span></div>`;
    }
    if (options.kind === 'role') {
      return html`<div class="block">${head}${this.renderRolePicker(token, options.options)}</div>`;
    }

    const editable = this.target?.editable ?? false;
    const typed = typedValueSpec(token, options.kind);
    return html`<div class="block">${head}<span class="chips">${options.options.map((option) => {
      const isCurrent = option === token.raw;
      const availability = chipAvailability(isCurrent, this.builtClasses.has(option), this.jitLive);
      if (availability === 'hidden') return nothing;
      const jitOnly = availability === 'jit-only';
      return html`<button type="button"
        class="chip ${isCurrent ? 'current' : ''} ${jitOnly ? 'jit' : ''}"
        title=${jitOnly ? `${option} — ${t('panel.publishNote')}` : option}
        ?disabled=${!editable || isCurrent}
        @click=${() => this.applyLiteral(replaceUtility(this.literal, token.raw, option, token.index), `${token.raw} → ${option}`)}
      >${option.split(':').pop() ?? option}${jitOnly ? html`<span class="star">*</span>` : nothing}</button>`;
    })}${typed ? this.renderTypedValue(token, typed) : nothing}</span></div>`;
  }

  /**
   * The `×` of a row: the whole property leaves.
   *
   * The LAST class can go too. That used to be refused because the literal WAS the anchor; now the
   * element is found by its position in the template, the write takes the whole `class="…"` attribute
   * out, and the panel comes back offering the "+". The one exception is an element the editor could
   * only find by COUNTING its literal — there the literal is the address (see canRemoveLast).
   */
  private removeButton(token: IUtilityToken, name: string) {
    const editable = this.target?.editable ?? false;
    const stranded = splitUtilities(this.literal).length <= 1 && !(this.target?.canRemoveLast ?? false);
    return html`<button type="button" class="remove" ?disabled=${!editable || stranded}
      title=${stranded ? t('panel.removeLast') : t('panel.removeProperty')}
      @mouseenter=${() => { if (!stranded) this.previewLiteral(removeUtility(this.literal, token.raw)); }}
      @mouseleave=${() => this.previewLiteral(null)}
      @click=${() => this.applyLiteral(
    removeUtility(this.literal, token.raw),
    t('status.propertyRemoved', { property: name }),
  )}>&times;</button>`;
  }

  /**
   * The `...` of a numeric row: `p-[13px]`, `w-[320px]`.
   *
   * The core has always READ a typed value as the current value of its family (it leads the chips and
   * the scale is the way back) — what was missing was the way in. Gated by the family AND by the kind,
   * so the colour side of `text-*` never gets a px input.
   */
  private renderTypedValue(token: IUtilityToken, spec: ITypedValueSpec) {
    const editable = this.target?.editable ?? false;

    if (this.typedEditing === token.index) {
      const current = readTypedValue(token);
      return html`<span class="custom">
        <input type="number" min=${spec.min} max=${spec.max} .value=${current === null ? '' : String(current)}
          placeholder=${`${spec.min}–${spec.max}`}
          @keydown=${this.onTypedKeydown}>
        <span class="unit">${spec.unit}</span>
        <button type="button" class="chip" @click=${() => this.commitTyped(token, spec)}>${t('panel.customApply')}</button>
        <button type="button" class="link" @click=${() => { this.typedEditing = null; }}>${t('panel.customCancel')}</button>
      </span>`;
    }

    return html`<button type="button" class="chip more" ?disabled=${!editable}
      title=${t('panel.typedOpen', { unit: spec.unit, min: spec.min, max: spec.max })}
      @click=${() => { this.typedEditing = token.index; this.focusTypedSoon(); }}>…</button>`;
  }

  /**
   * The "+": a property this element does not have yet.
   *
   * Two steps, never a form — the category, then the property — because the catalog is ~20 entries and
   * a flat list of twenty in a 340px panel is a scroll, not a menu. The new property is born with the
   * value the project uses most; colour is the exception (no concentration to call a default), and it
   * opens the design-system palette instead of guessing.
   */
  private renderAdd() {
    const editable = this.target?.editable ?? false;
    const options = addableProperties(this.literal, { childCount: this.target?.childCount ?? 0 });

    if (!options.length) {
      return html`<div class="block add readonly">
        <span class="label">${t('panel.addProperty')}</span>
        <span class="reason">${t('panel.addNothing')}</span>
      </div>`;
    }

    if (this.addColor) {
      const entry = addableProperty(this.addColor);
      const roles = entry?.family ? newRoleOptions(entry.family, this.dsRoles, (cssVar) => this.resolveVar(cssVar)) : [];
      return html`<div class="block add">
        <span class="head-row">
          <span class="label">${t(this.addColor)}</span>
          <button type="button" class="link" @click=${() => { this.addColor = null; }}>${t('panel.customCancel')}</button>
        </span>
        ${roles.length
    ? html`<span class="role-list">${roles.map((option) => html`<button type="button" class="role-item"
            @click=${() => this.addSeed(this.addColor ?? '', option)}>${this.roleRow(option)}</button>`)}</span>`
    : html`<span class="reason">${t('reason.noDsTokens')}</span>`}
        <small class="hint">${t('panel.addColor')}</small>
      </div>`;
    }

    if (this.addGroup) {
      const group = this.addGroup;
      return html`<div class="block add">
        <span class="head-row">
          <span class="label">${t('panel.addPick')} · ${t(`group.${group}`)}</span>
          <button type="button" class="link" @click=${() => { this.addGroup = null; }}>${t('panel.customCancel')}</button>
        </span>
        <span class="chips">${options.filter((entry) => entry.group === group).map((entry) => this.addChip(entry))}</span>
      </div>`;
    }

    // Only the groups that have something to offer for THIS element: an empty category is a promise
    // the panel cannot keep.
    const groups = ADD_GROUPS.filter((group) => options.some((entry) => entry.group === group));
    return html`<div class="block add">
      <span class="label" title=${t('panel.addTitle')}>${t('panel.addProperty')}</span>
      <span class="chips">${groups.map((group) => html`<button type="button" class="chip" ?disabled=${!editable}
        @click=${() => { this.addGroup = group; }}>${t(`group.${group}`)}</button>`)}</span>
    </div>`;
  }

  private addChip(entry: IAddableProperty) {
    const editable = this.target?.editable ?? false;
    const seed = entry.seed;
    // Same rule as every other chip: a class with no rule in the built css is marked, never silent.
    const jitOnly = Boolean(seed) && !this.builtClasses.has(seed ?? '');
    const title = seed
      ? (jitOnly ? `${seed} — ${t('panel.publishNote')}` : seed)
      : t('panel.addColor');

    return html`<button type="button" class="chip ${jitOnly ? 'jit' : ''}" ?disabled=${!editable} title=${title}
      @mouseenter=${() => { if (seed) this.previewLiteral(addUtility(this.literal, seed)); }}
      @mouseleave=${() => this.previewLiteral(null)}
      @click=${() => { if (seed) this.addSeed(entry.property, seed); else this.addColor = entry.property; }}
    >${t(entry.property)}${jitOnly ? html`<span class="star">*</span>` : nothing}</button>`;
  }

  private addSeed(property: string, cls: string): void {
    this.addGroup = null;
    this.addColor = null;
    this.applyLiteral(addUtility(this.literal, cls), t('status.propertyAdded', { property: t(property) }));
  }

  /**
   * The copied style, and what pasting it would do to THIS element.
   *
   * The summary runs in two directions on purpose. Pasting replaces, so it also REMOVES what the
   * target had and the source does not — that is the difference between "ficou igual" and "ficou
   * parecido", and it is the half nobody expects unless it is on screen before the click.
   */
  private renderPaste() {
    const clip = this.clipboard;
    if (!clip) return nothing;

    const editable = this.target?.editable ?? false;
    const full = this.pasteResult();
    const looks = pasteCategories(this.literal, clip.literal, ['appearance']);
    const diff = diffLiterals(this.literal, full);
    const identical = full === this.literal;
    // The toggle is offered when there IS a place to argue about: one this element would lose, or one
    // the source would bring along (the `max-w-6xl` of a container).
    const place = new Set([
      ...classesInCategories(this.literal, ['place']),
      ...classesInCategories(clip.literal, ['place']),
    ]);

    return html`<div class="block paste">
      <span class="label" title=${clip.literal}>${t('panel.pasteTitle', { tag: clip.tag })}</span>
      <span class="paste-actions">
        <button type="button" class="chip" ?disabled=${!editable || identical}
          title=${t('panel.pasteTitleHint')}
          @mouseenter=${() => this.previewLiteral(full)}
          @mouseleave=${() => this.previewLiteral(null)}
          @click=${() => this.applyPaste(full)}>${t('panel.paste')}</button>
        <button type="button" class="chip" ?disabled=${!editable || looks === this.literal}
          title=${t('panel.pasteLooksHint')}
          @mouseenter=${() => this.previewLiteral(looks)}
          @mouseleave=${() => this.previewLiteral(null)}
          @click=${() => this.applyPaste(looks)}>${t('panel.pasteLooks')}</button>
        <button type="button" class="link" @click=${() => { this.clipboard = null; }}>${t('panel.pasteForget')}</button>
      </span>
      ${identical
    ? html`<span class="reason">${t('panel.pasteSame')}</span>`
    : html`
        ${diff.added.length ? this.renderDiffRow('in', diff.added, place) : nothing}
        ${diff.removed.length ? this.renderDiffRow('out', diff.removed, place) : nothing}`}
      ${place.size ? html`
        <label class="switch">
          <input type="checkbox" .checked=${this.keepPlace} ?disabled=${!editable}
            @change=${(e: Event) => { this.keepPlace = (e.target as HTMLInputElement).checked; }}>
          ${t('panel.keepPlace')}
        </label>
        <small class="hint">${t('panel.keepPlaceHint')}</small>` : nothing}
    </div>`;
  }

  /** One direction of the summary: what comes in, or what goes out. */
  private renderDiffRow(direction: 'in' | 'out', classes: string[], place: Set<string>) {
    return html`<span class="diff-row">
      <span class="dir ${direction}">${t(direction === 'in' ? 'panel.pasteEnters' : 'panel.pasteLeaves')}</span>
      <span class="toks">${classes.map((cls) => {
    // Same honesty as the chips: a class with no rule in the BUILT css works here and only reaches
    // the client on the next publish. Pasting must not be the way that slips through.
    const jitOnly = direction === 'in' && !this.builtClasses.has(cls);
    return html`<span class="tok ${direction} ${place.has(cls) ? 'place' : ''}"
      title=${jitOnly ? `${cls} — ${t('panel.publishNote')}` : cls}
      >${cls}${jitOnly ? html`<span class="star">*</span>` : nothing}</span>`;
  })}</span>
    </span>`;
  }

  /** What pasting the clipboard onto this element would produce, with the toggle taken into account. */
  private pasteResult(): string {
    const clip = this.clipboard;
    if (!clip) return this.literal;
    // Nothing held back: the result IS the source's literal, which is what "ficar igual" means.
    if (!this.keepPlace) return pasteStyle(this.literal, clip.literal);
    return pasteStyle(
      this.literal,
      clip.literal,
      classesInCategories(this.literal, ['place']),
      classesInCategories(clip.literal, ['place']),
    );
  }

  private onCopy = (): void => {
    const literal = this.literal;
    const tag = this.target?.tag ?? '';
    if (!literal.trim()) {
      this.status(t('status.nothingToCopy'));
      return;
    }
    this.clipboard = { literal, tag };
    this.status(t('status.copied', { tag }));
  };

  private applyPaste(literal: string): void {
    this.applyLiteral(literal, t('status.pasted', { tag: this.clipboard?.tag ?? '' }));
  }

  /**
   * The design-system roles as a palette: a swatch, the role name, the colour.
   *
   * Not a `<select>`: a native `<option>` takes no markup, so the only way to show the colour there is
   * to paint the whole row. It expands INLINE because the panel scrolls — a positioned popup would be
   * clipped by its own container.
   */
  private renderRolePicker(token: IUtilityToken, options: string[]) {
    const current = options[0];
    const open = this.roleEditing === token.index;
    const editable = this.target?.editable ?? false;

    const row = (option: string) => this.roleRow(option);

    return html`<span class="chips">
      <button type="button" class="role-btn" title=${t('panel.roleTitle')} ?disabled=${!editable}
        @click=${() => { this.roleEditing = open ? null : token.index; }}>
        ${row(current)}<span>${open ? '▴' : '▾'}</span>
      </button>
      ${open ? html`<span class="role-list">${options.map((option) => {
        const isCurrent = option === current;
        const availability = chipAvailability(isCurrent, this.builtClasses.has(option), this.jitLive);
        if (availability === 'hidden') return nothing;
        return html`<button type="button" class="role-item ${isCurrent ? 'current' : ''}"
          @click=${() => {
    this.roleEditing = null;
    this.applyLiteral(replaceUtility(this.literal, token.raw, option, token.index), `${roleLabel(token.raw)} → ${roleLabel(option)}`);
  }}>${row(option)}${isCurrent ? html`<span>✓</span>` : nothing}</button>`;
      })}</span>` : nothing}
    </span>`;
  }

  /** A swatch, the role name and the colour it resolves to — one line of the palette. */
  private roleRow(option: string) {
    const value = this.resolveVar(roleVar(option));
    const colour = colorOf(value);
    return html`
      <span class="swatch ${colour ? '' : 'empty'}" style=${colour ? `background:${colour}` : ''}></span>
      <span class="role-name">${roleLabel(option)}</span>
      <span class="role-value">${value}</span>
    `;
  }

  // ─── Animations tab ────────────────────────────────────────────────────────

  private renderAnimations() {
    const spec = animationScreen(this.screen);
    const editable = this.target?.editable ?? false;
    const state = this.animationState();
    const activeOptions = new Set(activeAnimations(this.literal));
    const activeGroups = new Set(activeAnimationGroups(this.literal));

    return html`
      ${spec.back ? html`<div class="crumb">
        <button type="button" class="link" @click=${() => this.goTo(spec.back!)}>‹ ${t('panel.back')}</button>
        <span class="here">${t(spec.title)}</span>
      </div>` : nothing}
      ${spec.note ? html`<div class="note">${t(spec.note)}</div>` : nothing}
      ${this.screen === 'root' && !activeOptions.size ? html`<div class="note">${t('panel.previewHint')}</div>` : nothing}
      <div class="rows">
        ${spec.rows.map((row) => {
    if (row.cascade) return this.renderCascade();
    const chips = row.state
      ? row.state.options.map((option) => this.chip({
        label: t(option.label),
        title: t(option.hint),
        current: state[row.state!.key] === (option.value === 'true' ? true : option.value),
        editable,
        onClick: () => this.applyState(row.state!.key, option.value),
      }))
      : row.mode === 'groups'
        ? (row.groups ?? []).map((group) => this.groupChip(group, activeGroups, state, editable))
        : (row.group ? row.group.options.map((option) => this.optionChip(row.group!, option, activeOptions, state, editable)) : []);

    return html`<div class="block">
          <span class="label">${t(row.title)}</span>
          <span class="chips">
            ${chips}
            ${row.more ? html`<button type="button" class="chip more" title=${t('panel.more')}
              @click=${() => this.goTo(row.more!)}>…</button>` : nothing}
            ${!row.more && row.group?.custom ? this.renderCustom(row.group) : nothing}
          </span>
        </div>`;
  })}
        ${spec.motionSwitch ? html`
          <label class="switch">
            <input type="checkbox" .checked=${state.motionSafe} ?disabled=${!editable}
              @change=${(e: Event) => this.applyState('motionSafe', String((e.target as HTMLInputElement).checked))}>
            ${t('panel.motionSafe')}
          </label>
          <small class="hint">${t('panel.motionSafeHint')}</small>` : nothing}
        ${spec.advanced ? html`<button type="button" class="link advanced"
          @click=${() => this.goTo(spec.advanced!)}>${t('panel.advanced')} ›</button>` : nothing}
      </div>
    `;
  }

  private optionChip(group: IAnimationGroup, option: IAnimationOption, active: Set<string>, state: IAnimationState, editable: boolean) {
    const isOn = active.has(option.id);
    const availability = this.availability(group, option, isOn, state);
    if (availability === 'hidden') return nothing;
    return this.chip({
      label: t(option.label),
      title: t(option.hint),
      current: isOn,
      editable,
      jitOnly: availability === 'jit-only',
      preview: option.id,
      onClick: () => this.applyLiteral(applyAnimationOption(this.literal, option.id, state), t(option.label)),
    });
  }

  private groupChip(group: IAnimationGroup, activeGroups: Set<string>, state: IAnimationState, editable: boolean) {
    const option = group.options.find((candidate) => candidate.id === group.defaultOptionId) ?? group.options[0];
    if (!option) return nothing;
    const isOn = activeGroups.has(group.id);
    return this.chip({
      label: t(group.rootLabel ?? group.title),
      title: t(option.hint),
      current: isOn,
      editable,
      jitOnly: this.availability(group, option, isOn, state) === 'jit-only',
      preview: option.id,
      onClick: () => this.applyLiteral(applyAnimationGroup(this.literal, group.id, state), t(group.rootLabel ?? group.title)),
    });
  }

  /**
   * The cascade row: "the children appear one after another", configured from the CONTAINER.
   *
   * The cap is stated instead of silently truncating: the delay is one class PER CHILD (Tailwind
   * cannot compute an index into a delay), so a long list would put dozens of classes on one element.
   */
  private renderCascade() {
    const children = this.target?.childCount ?? 0;
    const editable = this.target?.editable ?? false;
    if (children < 2) {
      return html`<div class="block readonly">
        <span class="label">${t('panel.cascadeTitle')}</span>
        <span class="reason">${t('panel.cascadeNoChildren')}</span>
      </div>`;
    }

    const current = readCascade(this.literal);
    const dropped = Math.max(0, children - CASCADE_MAX_CHILDREN);
    return html`<div class="block">
      <span class="label">${t('panel.cascadeTitle')}</span>
      <span class="chips">${CASCADE_STEPS.map((step) => this.chip({
    label: `${step}ms`,
    title: t('panel.cascadeChip', { step }),
    current: current.step === step,
    editable,
    onClick: () => this.applyCascadeStep(step, children),
  }))}</span>
      <span class="reason">${dropped > 0
    ? t('panel.cascadeCapped', { count: children, dropped, max: CASCADE_MAX_CHILDREN })
    : t('panel.cascadeChildren', { count: children })}</span>
    </div>`;
  }

  /** The typed value: the group's own chip when it is set, and the way in when it is not. */
  private renderCustom(group: IAnimationGroup) {
    const spec = group.custom;
    if (!spec) return nothing;
    const editable = this.target?.editable ?? false;
    const typed = readAnimationCustom(this.literal, group.id);

    if (this.customEditing === group.id) {
      return html`<span class="custom">
        <input type="number" min=${spec.min} max=${spec.max} .value=${typed === null ? '' : String(typed)}
          placeholder=${`${spec.min}–${spec.max}`}
          @keydown=${this.onCustomKeydown}>
        <span class="unit">${spec.unit}</span>
        <button type="button" class="chip" @click=${() => this.commitCustom(group.id)}>${t('panel.customApply')}</button>
        <button type="button" class="link" @click=${() => { this.customEditing = null; }}>${t('panel.customCancel')}</button>
      </span>`;
    }

    return html`
      ${typed === null ? nothing : this.chip({
    label: `${typed}${spec.unit}`,
    title: t('panel.customClear', { hint: t(spec.hint) }),
    current: true,
    editable,
    onClick: () => this.applyLiteral(removeAnimationCustom(this.literal, group.id), t('status.customCleared')),
  })}
      <button type="button" class="chip more" ?disabled=${!editable}
        title=${t('panel.customOpen', { hint: t(spec.hint) })}
        @click=${() => { this.customEditing = group.id; this.focusCustomSoon(); }}>…</button>`;
  }

  private chip(chip: {
    label: string;
    title: string;
    current: boolean;
    editable: boolean;
    jitOnly?: boolean;
    preview?: string;
    onClick: () => void;
  }) {
    return html`<button type="button"
      class="chip ${chip.current ? 'current' : ''} ${chip.jitOnly ? 'jit' : ''}"
      title=${chip.jitOnly ? `${chip.title} — ${t('panel.jitOnly')}` : chip.title}
      ?disabled=${!chip.editable}
      @mouseenter=${() => this.preview(chip.preview ?? null)}
      @mouseleave=${() => this.preview(null)}
      @click=${chip.onClick}
    >${chip.label}${chip.jitOnly ? html`<span class="star">*</span>` : nothing}</button>`;
  }

  // ─── State and intents ─────────────────────────────────────────────────────

  private get literal(): string {
    return this.target?.literal ?? '';
  }

  /** The animation state of the selection, plus the switches flipped before anything was applied. */
  private animationState(): IAnimationState {
    return { ...readAnimationState(this.literal), ...this.pendingState };
  }

  /** Same rule as every other chip: a class with no rule in the built css and no JIT does nothing. */
  private availability(group: IAnimationGroup, option: IAnimationOption, isOn: boolean, state: IAnimationState) {
    const classes = option.classes.map((cls) => buildAnimationClass(cls, group.kind, state));
    return chipAvailability(isOn, classes.every((cls) => this.builtClasses.has(cls)), this.jitLive);
  }

  private goTo(screen: AnimationScreen): void {
    this.screen = screen;
    this.customEditing = null;
    this.preview(null);
  }

  private applyState(key: AnimationStateKey, value: string): void {
    const resolved = key === 'motionSafe' ? value === 'true' : value;
    this.pendingState = { ...this.pendingState, [key]: resolved };
    const next = applyAnimationState(this.literal, key, value);
    if (next === this.literal) {
      // Nothing on the element to rewrite yet: the choice is remembered for the next chip.
      this.requestUpdate();
      return;
    }
    const what = key === 'motionSafe'
      ? t(value === 'true' ? 'status.motionSafeOn' : 'status.motionSafeOff')
      : value;
    this.applyLiteral(next, what);
  }

  private applyCascadeStep(step: number, children: number): void {
    if (readCascade(this.literal).step === step) {
      this.applyLiteral(removeCascade(this.literal), t('status.cascadeRemoved'));
      return;
    }
    const result = applyCascade(this.literal, step, children, this.animationState());
    this.applyLiteral(result.literal, result.dropped > 0
      ? t('status.cascadePartial', { step, count: result.applied })
      : t('status.cascadeApplied', { step }));
  }

  private commitCustom(groupId: string): void {
    const input = this.renderRoot.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (!input) return;
    if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) {
      this.status(t('status.needNumber'));
      return;
    }
    const result = applyAnimationCustom(this.literal, groupId, Number(input.value), this.animationState());
    if (!result) return;
    this.customEditing = null;
    const group = ANIMATION_GROUPS.find((candidate) => candidate.id === groupId);
    this.applyLiteral(result.literal, `${t(group?.title ?? '')} ${result.value}${group?.custom?.unit ?? ''}`);
  }

  private commitTyped(token: IUtilityToken, spec: ITypedValueSpec): void {
    const input = this.renderRoot.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (!input) return;
    if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) {
      this.status(t('status.needNumber'));
      return;
    }
    const next = applyTypedValue(this.literal, token, Number(input.value), spec);
    this.typedEditing = null;
    this.applyLiteral(next, `${token.raw} → ${splitUtilities(next)[token.index]?.raw ?? ''}`);
  }

  /** Enter applies, Escape cancels — contained, exactly like the animations input. */
  private onTypedKeydown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const token = splitUtilities(this.literal).find((candidate) => candidate.index === this.typedEditing);
      const spec = token ? typedValueSpec(token, utilityOptions(token).kind) : null;
      if (token && spec) this.commitTyped(token, spec);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.typedEditing = null;
    }
  };

  private focusTypedSoon(): void {
    void this.updateComplete.then(() => {
      (this.renderRoot.querySelector('input[type="number"]') as HTMLInputElement | null)?.focus();
    });
  }

  /**
   * Enter applies, Escape cancels — and the event stops here.
   *
   * The editor is armed while this panel is open: without the containment the page (and the shell's
   * shortcuts) would see every keystroke typed into the field.
   */
  private onCustomKeydown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    const input = e.target as HTMLInputElement;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.commitCustom(this.customEditing ?? '');
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.customEditing = null;
    }
    void input;
  };

  private focusCustomSoon(): void {
    void this.updateComplete.then(() => {
      (this.renderRoot.querySelector('input[type="number"]') as HTMLInputElement | null)?.focus();
    });
  }

  private applyLiteral(literal: string, what: string): void {
    if (literal === this.literal) return;
    this.preview(null);
    this.dispatchEvent(new CustomEvent<IPickerApply>('picker-apply', {
      detail: { literal, what },
      bubbles: true,
      composed: true,
    }));
  }

  /** The editor owns the element, so it owns the preview: the panel only says WHAT to show. */
  private preview(optionId: string | null): void {
    if (optionId && !animationOption(optionId)) return;
    this.emitPreview(optionId ? { option: optionId } : null);
  }

  /** The other kind of preview: a whole class attribute, which is what a paste produces. */
  private previewLiteral(literal: string | null): void {
    this.emitPreview(literal === null || literal === this.literal ? null : { literal });
  }

  private emitPreview(detail: IPickerPreview | null): void {
    this.dispatchEvent(new CustomEvent<IPickerPreview | null>('picker-preview', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  private status(message: string): void {
    this.dispatchEvent(new CustomEvent('picker-status', { detail: message, bubbles: true, composed: true }));
  }

  private onClose = (): void => {
    this.preview(null);
    this.dispatchEvent(new CustomEvent('picker-close', { bubbles: true, composed: true }));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'cbe--class-picker-102033': ClassPickerPanel;
  }
}
