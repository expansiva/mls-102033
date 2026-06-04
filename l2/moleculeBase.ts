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
  // INERT MODE — Molecule inside another molecule's slot tag
  // ===========================================================================

  /**
   * When true, this molecule is inside another molecule's slot tag.
   * It should NOT render — it exists only as raw HTML for the parent
   * molecule to read via getSlotContent().
   */
  private _isInert = false;

  /**
   * Checks if this element is inside a slot tag of a parent molecule.
   * Walks up the DOM looking for a parent MoleculeAuraElement whose
   * slot tags include one of our ancestors.
   */
  private _checkIfInert(): boolean {
    let current: HTMLElement | null = this.parentElement;
    let slotTagCandidate: HTMLElement | null = null;

    while (current) {
      // Check if current is a MoleculeAuraElement
      if (current instanceof MoleculeAuraElement) {
        // Check if any of our ancestors (between us and this molecule)
        // is one of its slot tags
        if (slotTagCandidate && current.slotTags.length > 0) {
          const candidateTag = slotTagCandidate.tagName;
          const isSlotTag = current.slotTags.some(
            st => st.toUpperCase() === candidateTag
          );
          if (isSlotTag) {
            return true;
          }
        }
        // This molecule is not our slot tag parent, stop looking
        // (we don't want to go beyond the nearest molecule ancestor)
        return false;
      }

      // Track the highest non-molecule ancestor as potential slot tag
      slotTagCandidate = current;
      current = current.parentElement;
    }

    return false;
  }

  // ===========================================================================
  // SNAPSHOT — Parsed copy of slot tags for reading
  // ===========================================================================

  private _snapshot: Document | null = null;

  /**
   * Returns a parsed Document snapshot for querying slot tags.
   */
  private getSnapshot(): Document {
    if (!this._snapshot) {
      this._takeSnapshot();
    }
    return this._snapshot!;
  }

  /**
   * Takes a snapshot: reads outerHTML from slot tag children,
   * parses into isolated Document.
   */
  private _takeSnapshot(): void {
    const parts: string[] = [];
    const children = Array.from(this.children);

    for (const child of children) {
      const tagName = child.tagName;
      const isSlotTag = this.slotTags.some(
        st => st.toUpperCase() === tagName
      );
      if (isSlotTag) {
        parts.push(child.outerHTML);
      }
    }

    const parser = new DOMParser();
    this._snapshot = parser.parseFromString(
      `<body>${parts.join('')}</body>`,
      'text/html'
    );
  }

  // ===========================================================================
  // INTERNAL — MutationObserver
  // ===========================================================================

  private _slotObserver: MutationObserver | null = null;
  private _updateDebounceTimer: number | null = null;
  public _mutationLock = false;

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  connectedCallback() {
    // Check if we're inside another molecule's slot tag
    this._isInert = this._checkIfInert();

    if (this._isInert) {
      // Do NOT render, do NOT call super.connectedCallback()
      // This element exists only as raw HTML for the parent to read
      return;
    }

    this._snapshot = null;
    this._hideSlotTags();
    super.connectedCallback();
    this._setupSlotObserver();
  }

  disconnectedCallback() {
    if (this._isInert) return;
    super.disconnectedCallback();
    this._teardownSlotObserver();
  }

  // ===========================================================================
  // SLOT TAG VISIBILITY
  // ===========================================================================

  private _hideSlotTags(): void {
    this.slotTags.forEach(tag => {
      this.querySelectorAll(tag).forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    });
  }

  // ===========================================================================
  // MUTATION OBSERVER — Slot Tag Reactivity
  // ===========================================================================

  private _setupSlotObserver() {
    this._slotObserver = new MutationObserver((mutations) => {
      if (this._mutationLock) return;

      const hasSlotChange = mutations.some((mutation) => {
        if (mutation.type === 'childList') {
          // Direct children: new slot tags added or removed?
          if (mutation.target === this) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = (node as Element).tagName;
                if (this.slotTags.some(st => st.toUpperCase() === tagName)) {
                  return true;
                }
              }
            }
            for (const node of Array.from(mutation.removedNodes)) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = (node as Element).tagName;
                if (this.slotTags.some(st => st.toUpperCase() === tagName)) {
                  return true;
                }
              }
            }
          }
          // Changes inside existing slot tags (e.g., new TableRow inside TableBody)
          if (this._isInsideSlotTag(mutation.target)) {
            return true;
          }
          return false;
        }
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          return this._isInsideSlotTag(mutation.target);
        }
        return false;
      });

      if (hasSlotChange) {
        this._debouncedSlotUpdate();
      }
    });

    this._slotObserver.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  private _isInsideSlotTag(node: Node): boolean {
    let current: Node | null = node;
    while (current && current !== this) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const tagName = (current as Element).tagName;
        if (this.slotTags.some(st => st.toUpperCase() === tagName)) {
          return true;
        }
      }
      current = current.parentNode;
    }
    return false;
  }

  private _teardownSlotObserver() {
    if (this._slotObserver) {
      this._slotObserver.disconnect();
      this._slotObserver = null;
    }
    if (this._updateDebounceTimer !== null) {
      clearTimeout(this._updateDebounceTimer);
      this._updateDebounceTimer = null;
    }
  }

  private _debouncedSlotUpdate() {
    if (this._updateDebounceTimer !== null) {
      clearTimeout(this._updateDebounceTimer);
    }
    this._updateDebounceTimer = window.setTimeout(() => {
      this._updateDebounceTimer = null;
      this._onSlotTagsChanged();
    }, 16);
  }

  /**
   * Called when slot tag content changes.
   * Re-takes snapshot, re-hides, re-renders.
   */
  _onSlotTagsChanged() {
    this._mutationLock = true;
    this._hideSlotTags();
    this._mutationLock = false;

    // Invalidate snapshot
    this._snapshot = null;

    // Force re-render
    this.requestUpdate();
  }

  // ===========================================================================
  // SLOT TAG READERS (read from snapshot)
  // ===========================================================================

  protected getSlot(tag: string): Element | null {
    return this.getSnapshot().querySelector(tag);
  }

  protected getSlots(tag: string): Element[] {
    return Array.from(this.getSnapshot().querySelectorAll(tag));
  }

  protected getSlotAttr(tag: string, attr: string): string | null {
    return this.getSnapshot().querySelector(tag)?.getAttribute(attr) || null;
  }

  protected getSlotContent(tag: string): string {
    const el = this.getSnapshot().querySelector(tag);
    return el ? el.innerHTML : '';
  }

  protected hasSlot(tag: string): boolean {
    return this.getSnapshot().querySelector(tag) !== null;
  }

}