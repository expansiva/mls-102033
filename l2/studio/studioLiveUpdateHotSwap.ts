/// <mls fileReference="_102033_/l2/studio/studioLiveUpdateHotSwap.ts" enhancement="_blank" />
// Live-update mode: patch the ALREADY REGISTERED class instead of redefining the tag.
//
// A tag can never be redefined, but the registered constructor is just an object: replacing the
// members of its prototype changes the behaviour of every instance — the ones on screen and the ones
// the shell creates later, which is what makes "navigate away and come back" show the edit.
//
// HOW THE NEW CODE IS OBTAINED
// From the VERSIONED URL of the local cache (`mls.stor.cache.getURL`), which is exactly what the
// compile just wrote there: `compileAndPostProcess(..., saveCache = true)` stores `prodJS` under
// `compilerResults.cacheVersion` ([mls.js:6681](static/libs/mls.js#L6681)). Every compile mints a new
// version, so the URL is unique and the module really re-evaluates.
//
// A BLOB WAS TRIED FIRST AND DOES NOT WORK. `import()` of a blob fails on the very first
// origin-rooted specifier:
//   Failed to resolve module specifier "/_102029_/l2/collabLitElement.js".
//   Invalid relative url or base scheme isn't hierarchical.
// A blob URL is not hierarchical, so there is no base to resolve `/...` against. Rewriting every
// specifier in the emitted JS would be the workaround; using the cache URL removes the problem
// instead — it is hierarchical and same-origin, so `/_1020xx_/...` and bare `lit` (document import
// map) resolve EXACTLY as they do for the app's normal modules, reusing the already-evaluated ones.
// That identity matters: a second copy of Lit would break `elementProperties`/`requestUpdate`.
//
// Note this is NOT the ambiguity fase 1 is about. That one asks whether the SW wins over the dist
// chunk for the UNVERSIONED page URL; this uses the versioned local-cache URL, the cache API's own
// documented purpose and something the whole studio already depends on.
//
// LIMITS (documented on purpose — this mode is chosen for text/i18n edits)
//  - PRIVATE CLASS FIELDS (`#field`) make the patch IMPOSSIBLE, not just imperfect — the guard below
//    refuses instead of breaking the component. See usesPrivateFields.
//  - Copying members is ADDITIVE: a member deleted in the new version stays on the registered class.
//  - `static styles` is not swapped, so a CSS change does not arrive through here.
//  - `document.createElement(tag)` still runs the OLD constructor, so a property ADDED by the edit
//    gets its reactive accessor (via finalize + elementProperties) but no default value.
// For a structural rewrite (an agent redoing the page) the honest mode is `reload`.

import type { ILiveUpdateContext, ILiveUpdateMode, ILiveUpdateResult } from '/_102033_/l2/studio/studioLiveUpdate.js';
import { t } from '/_102033_/l2/studio/studioMessages.js';
import type { IStudioEditTarget } from '/_102033_/l2/studio/studioEditTarget.js';

/** Lit's static surface we touch. `finalize` is protected in the typings but callable at runtime. */
interface LitLikeConstructor extends CustomElementConstructor {
  finalize?: () => void;
  elementProperties?: Map<PropertyKey, unknown>;
}

interface LitLikeElement extends HTMLElement {
  requestUpdate?: () => void;
}

/** Compiled JS of a target — already produced by the compile that precedes every live update. */
function readCompiledJs(target: IStudioEditTarget): string {
  return (target.model as mls.editor.IModelTS).compilerResults?.prodJS || '';
}

/**
 * True when a module's code touches PRIVATE CLASS FIELDS (`#field`).
 *
 * THIS IS WHY THE PATCH HAS TO BE REFUSED. A private field is branded onto the instance by the class
 * that DECLARES it. Installing a member from the freshly evaluated module means installing a function
 * closed over that module's own field storage (a fresh WeakMap once TypeScript downlevels `#`, the
 * class's own brand when it does not) — while every instance was branded by the OLD module: the live
 * ones, and the future ones too, since `document.createElement(tag)` keeps running the OLD
 * constructor. Every access then throws
 *
 *   TypeError: Cannot read private member from an object whose class did not declare it
 *
 * on each render, which stops the component from rendering at all. Measured: the pages the current
 * generator emits carry 8 `__classPrivateField` calls each (the `#msgLang`/`#msgCache` cache of the
 * `msg` getter); the previous generation's carry none, which is why this went unnoticed there.
 *
 * There is no fix from this side: the field storage is module-private, and re-branding would mean
 * reconstructing the instances — which is a remount, not a hot swap.
 */
function usesPrivateFields(js: string): boolean {
  return js.includes('__classPrivateField') || /this\.#/u.test(js);
}

interface IFreshModuleUrl {
  url: string | null;
  /** Why there is no URL, for the status strip. */
  reason: string;
}

/**
 * URL of the just-compiled JS in the local cache, versioned by `cacheVersion`.
 *
 * Null with a reason rather than throwing: a TypeScript error in the edited file is a normal outcome
 * here, and it must be reported as such and not as a crash.
 */
async function freshModuleUrl(target: IStudioEditTarget): Promise<IFreshModuleUrl> {
  const model = target.model as mls.editor.IModelTS;
  const results = model.compilerResults;
  if (!results) return { url: null, reason: t('live.notCompiled') };
  if (results.errors && results.errors.length > 0) {
    return { url: null, reason: t('live.tsErrors', { count: results.errors.length }) };
  }
  if (!results.cacheVersion) return { url: null, reason: t('live.noCacheVersion') };

  const { project, folder, shortName } = target.storFile;
  const url = await mls.stor.cache.getURL(project, folder, shortName, '.js', results.cacheVersion);
  if (!url) return { url: null, reason: t('live.notInCache') };
  return { url, reason: '' };
}

/**
 * Imports a module URL without letting it register anything.
 *
 * The compiled PAGE module carries `@customElement('tag')`, and `customElements.define` THROWS on a
 * name already in use — so evaluating it would abort. The define is neutralized for the duration
 * (same trick the preview uses in previewModeAura.addJsReference) and restored in a `finally`:
 * leaving a patched `define` behind would silently swallow every later registration in the app.
 */
async function evaluateModule(url: string): Promise<Record<string, unknown>> {
  const original = customElements.define.bind(customElements);
  try {
    customElements.define = ((name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions) => {
      if (customElements.get(name)) return;
      return original(name, ctor, options);
    }) as typeof customElements.define;
    return await import(url) as Record<string, unknown>;
  } finally {
    customElements.define = original;
  }
}

/** The custom-element class a module exports (the only export whose prototype is an HTMLElement). */
function pickElementClass(mod: Record<string, unknown>): LitLikeConstructor | null {
  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && value.prototype instanceof HTMLElement) {
      return value as LitLikeConstructor;
    }
  }
  return null;
}

/** Makes Lit build the reactive accessors and populate `elementProperties` of a class. */
function finalize(ctor: LitLikeConstructor): void {
  try {
    ctor.finalize?.();
  } catch (err) {
    console.warn('[studioLiveUpdate] finalize failed:', err);
  }
}

/** Copies the new reactive property declarations into the registered class. */
function mergeElementProperties(registered: LitLikeConstructor, fresh: LitLikeConstructor): void {
  if (!fresh.elementProperties || !registered.elementProperties) return;
  fresh.elementProperties.forEach((options, name) => {
    registered.elementProperties?.set(name, options);
  });
}

/**
 * Replaces the members the page class declares itself.
 *
 * Used when the EDITED file is the page: `render()` and friends live on its own prototype.
 */
function patchOwnMembers(registered: LitLikeConstructor, fresh: LitLikeConstructor): void {
  for (const key of Object.getOwnPropertyNames(fresh.prototype)) {
    if (key === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(fresh.prototype, key);
    if (descriptor) Object.defineProperty(registered.prototype, key, descriptor);
  }
}

/**
 * Re-links the registered class to the NEW base class.
 *
 * Used when the edited file is the SHARED base — the usual case, since it owns the i18n catalog.
 * Swapping the chain link (instead of copying the base's members onto the page prototype) keeps the
 * page's own overrides intact: copying would clobber a `render()` the page declares.
 *
 * The static side is relinked too, so `styles`/`elementProperties` lookups that fall through to the
 * base reach the new one.
 */
function relinkBaseClass(registered: LitLikeConstructor, freshBase: LitLikeConstructor): void {
  Object.setPrototypeOf(registered.prototype, freshBase.prototype);
  Object.setPrototypeOf(registered, freshBase);
}

function sameFile(a: IStudioEditTarget, b: IStudioEditTarget): boolean {
  return a.project === b.project && a.shortName === b.shortName && a.folder === b.folder;
}

export const hotSwapMode: ILiveUpdateMode = {
  name: 'hotSwap',
  // English: devtools listing (see studioLiveUpdate).
  description: 'patches the members of the already registered class (keeps the screen state, no reload)',

  async apply(ctx: ILiveUpdateContext): Promise<ILiveUpdateResult> {
    const registered = customElements.get(ctx.pageTag) as LitLikeConstructor | undefined;
    if (!registered) {
      return { ok: false, message: t('live.tagNotRegistered', { tag: ctx.pageTag }) };
    }

    // BEFORE evaluating anything: installing members of a class that declares private fields breaks
    // every instance (see usesPrivateFields). Refusing keeps the app running; the honest way to see
    // the edit is `studioLiveUpdate.set('reload')`.
    if (usesPrivateFields(readCompiledJs(ctx.edited))) {
      return {
        ok: false,
        message: t('live.privateFields'),
      };
    }

    const compiled = await freshModuleUrl(ctx.edited);
    if (!compiled.url) {
      return { ok: false, message: `nada a aplicar: ${compiled.reason}` };
    }

    const mod = await evaluateModule(compiled.url);
    const fresh = pickElementClass(mod);
    if (!fresh) {
      return { ok: false, message: t('live.noElementClass') };
    }

    finalize(fresh);

    const isPageItself = sameFile(ctx.edited, ctx.page);
    if (isPageItself) patchOwnMembers(registered, fresh);
    else relinkBaseClass(registered, fresh);

    mergeElementProperties(registered, fresh);

    // Relinking the base is inert when the PAGE declares its own `msg`: the current generator copies
    // the shared strings into the page's catalog at module evaluation
    // (`{...fromShared(sharedMessages['pt'])}`), so the page shadows whatever the new base holds.
    // Saying "applied" here would be a lie.
    if (!isPageItself && Object.getOwnPropertyDescriptor(registered.prototype, 'msg')) {
      return {
        ok: false,
        message: t('live.pageOwnCatalog'),
      };
    }

    // Live instances keep their state; they just re-render against the new code.
    let repainted = 0;
    for (const el of Array.from(document.querySelectorAll(ctx.pageTag))) {
      (el as LitLikeElement).requestUpdate?.();
      repainted += 1;
    }

    return {
      ok: true,
      message: isPageItself
        ? t('live.appliedPage', { count: repainted })
        : t('live.appliedBase', { count: repainted }),
    };
  },
};
