/// <mls fileReference="_102033_/l2/moleculeBase.ts" enhancement="_blank"/>

import { html, TemplateResult, PropertyValues } from 'lit';
import { StateLitElement } from '/_102029_/l2/stateLitElement.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';

// =============================================================================
// BASE CLASS
// =============================================================================


export class MoleculeAuraElement extends StateLitElement {

  // ===========================================================================
  // DATA-CLASS — consumer-provided CSS classes for the root element
  // Usage: <my-component data-class="w-full mt-4">
  // ===========================================================================

  @propertyDataSource({ type: String, attribute: 'data-class' })
  cssClass: string = '';

  // ===========================================================================
  // SLOT TAGS DEFINITION
  // Override in child component
  // ===========================================================================

  protected slotTags: string[] = [];

  // ===========================================================================
  // LIVE SLOTS — composition instead of serialization
  // ===========================================================================

  /**
   * Opt in to LIVE slots: the consumer's slot content is MOVED into place as real
   * DOM nodes, instead of being read as a string and re-emitted with unsafeHTML.
   *
   * Why this exists: the snapshot path serializes slot children via `outerHTML` and
   * re-parses them. Serializing destroys event bindings and component identity, so
   * anything interactive the consumer puts in a slot is dead on arrival — and nested
   * molecules had to be made inert to keep the parent's snapshot readable. That makes
   * slots content-only, which defeats composition.
   *
   * With live slots the nodes are never serialized: they are moved, and moving preserves
   * listeners, Lit part references and nested custom elements. A molecule that opts in
   * also stops forcing its slotted descendants to be inert — they render normally.
   *
   * Opt-in per molecule so the two mechanisms coexist. Keep the snapshot path where the
   * slot carries DATA to be parsed (`TableHead key=…`, `Item value=…`); use live slots
   * where it carries CONTENT or CONTROLS (`Action`, `Label`, `Icon`, `Trigger`).
   */
  protected usesLiveSlots = false;

  /**
   * The consumer's live nodes, per slot tag, held by reference.
   *
   * Holding them is what makes the mechanism survive the anchor coming and going. When a
   * template branch leaves the render (a hidden modal, a collapsed region), Lit removes
   * the anchor and everything under it — including these nodes. Removing a node from the
   * DOM does not destroy it while something still references it, and its listeners stay
   * attached, so the next projection can simply put it back.
   */
  private _liveNodes = new Map<string, Node[]>();

  /**
   * Per-element anchors, for molecules that don't pass a slot through but TRANSFORM it.
   *
   * A table is the motivating case: it reads `TableBody > TableRow > TableCell`, sorts and
   * paginates, then re-emits real `<tr>`/`<td>`. The source of a cell's content is a nested
   * element, not a direct child, and there are N×M of them — so an anchor keyed by tag name
   * can't address it. These map an id to the source element instead.
   *
   * The id lives in a WeakMap so the SAME element always gets the SAME id across renders,
   * which is what lets `_liveNodes` survive a row leaving the page and coming back.
   */
  private _liveRefSeq = 0;
  private _liveRefIds = new WeakMap<Element, string>();
  private _liveRefs = new Map<string, Element>();

  /**
   * Renders the placeholder where a live slot's content lands.
   *
   * The anchor must stay free of Lit bindings: Lit does not manage children it did not
   * create, so nodes appended here survive every re-render. Put bindings around the
   * anchor, never inside it.
   */
  protected renderLiveSlot(tag: string, cls = ''): TemplateResult {
    return html`<span data-ml-live-slot="${tag}" class="${cls}"></span>`;
  }

  /**
   * Same as `renderLiveSlot`, but bound to a specific source ELEMENT instead of a tag.
   *
   * Use it when the molecule transforms the slot structure and one tag maps to many
   * destinations — a table cell, a list item. Pass the LIVE element (from `getLiveSlot`),
   * never a snapshot clone: a clone's children are copies, and moving copies projects
   * dead nodes.
   */
  protected renderLiveSlotFrom(source: Element | null | undefined, cls = ''): TemplateResult {
    if (!source) return html``;
    let id = this._liveRefIds.get(source);
    if (!id) {
      id = `ref${(this._liveRefSeq += 1)}`;
      this._liveRefIds.set(source, id);
    }
    this._liveRefs.set(id, source);
    return html`<span data-ml-live-ref="${id}" class="${cls}"></span>`;
  }

  /**
   * Text currently rendered for a source element, projected or not.
   *
   * A transforming molecule that sorts or filters by cell text cannot read the source
   * element after projection — its children were moved out, so `textContent` is empty.
   * This reads the projected nodes instead, which keeps the value CURRENT: caching the
   * text at capture time would go stale the moment the consumer changed it.
   */
  protected getLiveText(source: Element | null | undefined): string {
    if (!source) return '';
    const id = this._liveRefIds.get(source);
    const nodes = id ? this._liveNodes.get(id) : undefined;
    if (nodes && nodes.length > 0) {
      return nodes.map((n) => n.textContent || '').join('').trim();
    }
    return (source.textContent || '').trim();
  }

  /**
   * The LIVE slot element for `tag` — not the snapshot clone.
   *
   * Structure reads (how many rows, which attributes) should come from here in a molecule
   * that projects, because the snapshot goes stale between mutations and, worse, a
   * re-snapshot after projection reads the emptied sources.
   */
  protected getLiveSlot(tag: string): Element | null {
    return this._findSlotChild(tag);
  }

  /**
   * Moves each live slot's children into its anchor.
   *
   * Runs from `update()` — right after Lit commits the DOM, so the anchors exist. It is
   * deliberately NOT in `updated()`: most molecules override that without calling super,
   * which would silently skip projection.
   */
  private _projectLiveSlots(): void {
    if (!this.usesLiveSlots) return;
    const byTag = this.querySelectorAll<HTMLElement>('[data-ml-live-slot]');
    const byRef = this.querySelectorAll<HTMLElement>('[data-ml-live-ref]');
    if (byTag.length === 0 && byRef.length === 0) return;

    // moving nodes mutates the subtree; without the lock the observer would see it as a
    // slot change and schedule another render, which would re-enter here in a loop
    this._mutationLock = true;
    try {
      byTag.forEach((anchor) =>
        this._fillAnchor(anchor, anchor.dataset.mlLiveSlot, (tag) => this._findSlotChild(tag))
      );
      byRef.forEach((anchor) =>
        this._fillAnchor(anchor, anchor.dataset.mlLiveRef, (id) => this._liveRefs.get(id) ?? null)
      );
    } finally {
      this._mutationLock = false;
    }
  }

  /** Capture-once + reattach-when-empty, shared by both anchor kinds. */
  private _fillAnchor(
    anchor: HTMLElement,
    key: string | undefined,
    resolve: (key: string) => Element | null
  ): void {
    if (!key) return;

    // An anchor can change owner. Lit reuses DOM by position in a `.map()` without
    // `repeat()`, so sorting or paginating a table hands anchor #2 a different source id
    // while it still holds the previous source's nodes. Evicting is safe — `_liveNodes`
    // keeps the references, so the nodes stay alive and detached, ready to be reattached
    // wherever their real owner lands. Without this the reattach guard below would see a
    // non-empty anchor and leave the wrong row's content in place.
    const held = anchor.dataset.mlLiveHeld;
    if (held && held !== key) {
      while (anchor.firstChild) anchor.removeChild(anchor.firstChild);
      delete anchor.dataset.mlLiveHeld;
    }

    // Capture once. The source's CHILDREN are what gets projected — not the slot element
    // itself — matching what the snapshot path exposed through getSlotContent().
    if (!this._liveNodes.has(key)) {
      const source = resolve(key);
      if (!source) return;
      const nodes = Array.from(source.childNodes);
      if (nodes.length === 0) return;
      this._liveNodes.set(key, nodes);
      (source as HTMLElement).style.display = 'none';
    }

    // (Re)attach whenever the anchor is empty. This runs on EVERY update on purpose: an
    // anchor that left the template and came back is a new, empty element, and the nodes
    // are detached but alive. Projecting only once was a real bug — the content vanished
    // the first time the branch was hidden.
    if (!anchor.firstChild) {
      for (const node of this._liveNodes.get(key)!) anchor.appendChild(node);
    }
    anchor.dataset.mlLiveHeld = key;
  }

  /** The consumer's slot element for `tag`, among this element's own children. */
  private _findSlotChild(tag: string): Element | null {
    const wanted = tag.toUpperCase();
    return Array.from(this.children).find((c) => c.tagName === wanted) ?? null;
  }

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
        // A parent on the LIVE slot path never needs us inert: it moves our nodes instead
        // of serializing them, so rendering normally is exactly what it wants. Staying
        // inert here is what used to make a molecule inside a slot a dead element.
        if (current.usesLiveSlots) {
          return false;
        }
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
    this.addEventListener('change', this._stopNativeFormEvent);
    this.addEventListener('input', this._stopNativeFormEvent);
  }

  /**
   * Projection hook.
   *
   * `update()` is where Lit commits the template to the DOM, so the anchors exist right
   * after `super.update()`. Chosen over `updated()` on purpose: most molecules override
   * `updated()` without calling super, and projection would silently never run. No
   * molecule overrides `update()`.
   */
  protected update(changed: PropertyValues) {
    // Drop the strong id→element map; `render()` repopulates it for the elements this pass
    // actually draws. The WeakMap keeps ids stable, so `_liveNodes` still matches an element
    // that comes back later (a row returning from another page).
    //
    // `_liveNodes` itself is NOT pruned on purpose: a source whose children were moved out
    // is empty forever, so dropping its cached nodes because it is off-screen this pass
    // would blank the cell when it returns.
    this._liveRefs.clear();
    super.update(changed);
    this._projectLiveSlots();
  }

  disconnectedCallback() {
    if (this._isInert) return;
    this.removeEventListener('change', this._stopNativeFormEvent);
    this.removeEventListener('input', this._stopNativeFormEvent);
    super.disconnectedCallback();
    this._teardownSlotObserver();
  }

  // ===========================================================================
  // SLOT TAG VISIBILITY
  // ===========================================================================

  private _stopNativeFormEvent = (e: Event) => {
    if (!(e instanceof CustomEvent)) e.stopImmediatePropagation();
  };

  private _hideSlotTags(): void {
    Array.from(this.children).forEach(child => {
      const tag = (child as HTMLElement).tagName?.toLowerCase();
      if (tag && this.slotTags.map(t => t.toLowerCase()).includes(tag)) {
        (child as HTMLElement).style.display = 'none';
      }
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

    // Re-capture a live slot ONLY when its source has children again — that means the
    // consumer replaced the slot's content wholesale. Clearing the map blindly would be a
    // bug: the source is normally empty (we moved its children out), so a blind clear
    // would drop the references and lose the content for good.
    //
    // Content edited *inside* an already-projected slot needs nothing here: those nodes
    // live in the anchor now, and the consumer's own render updates them in place.
    for (const tag of this.slotTags) {
      const source = this._findSlotChild(tag);
      if (source && source.childNodes.length > 0) this._liveNodes.delete(tag);
    }
    // Same rule for per-element sources: Lit re-creating a cell's subtree puts children back
    // on the source, and that is the signal to capture again.
    for (const [id, source] of this._liveRefs) {
      if (source.childNodes.length > 0) this._liveNodes.delete(id);
    }

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

  protected getSlotClass(tag: string): string {
    return this.getSlotAttr(tag, 'data-class') || '';
  }

}
