/// <mls fileReference="_102033_/l2/moleculeBase.ts" enhancement="_blank"/>

import { StateLitElement } from '/_102029_/l2/stateLitElement.js';

// =============================================================================
// BASE CLASS
// =============================================================================

export class MoleculeAuraElement extends StateLitElement {

  // ===========================================================================
  // SLOT TAGS DEFINITION
  // Override in child component
  // ===========================================================================

  protected slotTags: string[] = [];

  // ===========================================================================
  // PARSED TEMPLATE DOM
  // ===========================================================================

  private _templateDoc: DocumentFragment | null = null;

  /**
   * Returns a parsed DOM fragment from the original template content.
   * Parsed once on first access, cached for subsequent reads.
   */
  private getTemplateDoc(): DocumentFragment {
    if (!this._templateDoc) {
      const template = this.querySelector(':scope > template') as HTMLTemplateElement;
      if (template) {
        this._templateDoc = template.content.cloneNode(true) as DocumentFragment;
      } else {
        this._templateDoc = document.createDocumentFragment();
      }
    }
    return this._templateDoc;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  connectedCallback() {
    this._templateDoc = null; // Invalidate cache
    this.wrapContentInTemplate();
    super.connectedCallback();
  }

  // ===========================================================================
  // CONTENT TEMPLATE WRAPPING
  // ===========================================================================

  /**
   * Wraps ALL inner content in a single <template> to prevent child
   * web components from rendering before the parent reads the content.
   * Must run BEFORE super.connectedCallback().
   */
  private wrapContentInTemplate(): void {
    if (this.querySelector(':scope > template')) return;
    const template = document.createElement('template');
    template.innerHTML = this.innerHTML;
    this.innerHTML = '';
    this.appendChild(template);
  }

  // ===========================================================================
  // SLOT TAG READERS
  // ===========================================================================

  /**
   * Returns a single slot tag element by name (from template DOM)
   */
  protected getSlot(tag: string): Element | null {
    return this.getTemplateDoc().querySelector(tag);
  }

  /**
   * Returns all elements of a slot tag (from template DOM)
   */
  protected getSlots(tag: string): Element[] {
    return Array.from(this.getTemplateDoc().querySelectorAll(tag));
  }

  /**
   * Returns an attribute value from a slot tag (from template DOM)
   */
  protected getSlotAttr(tag: string, attr: string): string | null {
    return this.getTemplateDoc().querySelector(tag)?.getAttribute(attr) || null;
  }

  /**
   * Returns the innerHTML of a slot tag (from template DOM)
   */
  protected getSlotContent(tag: string): string {
    const el = this.getTemplateDoc().querySelector(tag);
    return el ? el.innerHTML : '';
  }

  /**
   * Checks if a slot tag exists (in template DOM)
   */
  protected hasSlot(tag: string): boolean {
    return this.getTemplateDoc().querySelector(tag) !== null;
  }

}