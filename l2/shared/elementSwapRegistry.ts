/// <mls fileReference="_102033_/l2/shared/elementSwapRegistry.ts" enhancement="_blank" />
// A custom element tag whose IMPLEMENTATION can be replaced (TASK-102020-live-update-stand-in).
//
// THE PROBLEM
// `customElements.define(tag, Class)` is final: a tag can never be redefined and never removed. So
// the live update of an edited page used to have to do surgery on the class already registered
// (studioLiveUpdateHotSwap.ts) — copying members onto a live prototype, which is partial BY
// CONSTRUCTION: `#private` fields, the constructor body, `static styles` and members DELETED in the
// new version are all out of reach of a prototype patch.
//
// THE MECHANISM
// Nothing says the registered class has to be the page's class. What gets registered here is a
// STAND-IN that has no body of its own and redirects construction to whatever implementation is
// current:
//
//     customElements.define(tag, StandIn)   <- stable forever, this is what the registry holds
//             |
//             '- construction redirects --> current impl (v1 -> v2 -> v3, swappable)
//
// A constructor is allowed to RETURN ANOTHER OBJECT, and `Reflect.construct(impl, [], new.target)`
// builds that object with the stand-in as `new.target` — which is what `HTMLElement`'s constructor
// uses to find the definition in the registry, so it is the only value that does not throw
// "Illegal constructor". The v2 constructor then RUNS FOR REAL on the new element: v2 class fields
// are installed, v2 `#private` fields are branded, and `this.constructor` (the stand-in, whose
// statics fall through to the impl) makes Lit read `elementProperties` and `elementStyles` from the
// current version. The whole table of holes the patch had disappears.
//
// The indirection has to be ABOVE the page class, not below it. `class X extends P` reads
// `P.prototype` ONCE, when the class is evaluated — and the registered class IS the page, which is
// exactly what an in-place edit changes. Making the base dynamic would change the wrong link.
//
// PROVEN IN A REAL BROWSER before this file existed (the task's phase 0, 11/11): define accepts the
// stand-in; a relink makes the next `createElement` run the v2 constructor; a v2 `#private` reads
// fine; the lifecycle stubs below are load-bearing (without them a page's own `connectedCallback`
// stays on v1 forever — confirmed with a negative control); an element already in the DOM upgrades
// without `InvalidStateError`; and Lit's `finalize()` writes own statics on the stand-in that shadow
// every future impl unless they are removed on each relink (see `stripForeignStatics`).
//
// STUDIO ONLY. Without the flag this module installs nothing and the app keeps the native `define`.

/** The subset of `CustomElementRegistry` used here — narrow so a Node test can pass a fake. */
export interface IElementRegistry {
  define(name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions): void;
  get(name: string): CustomElementConstructor | undefined;
}

/** Lit's static surface this file touches. `finalize` is protected in the typings, callable at runtime. */
interface ILitLikeConstructor extends CustomElementConstructor {
  finalize?: () => void;
}

/**
 * localStorage key that arms the swap on the NEXT boot.
 *
 * It has to be a stored flag and not a live call: the stand-in only exists if it is installed BEFORE
 * the first `define` of a tag, which happens while the app boots — long before anyone can press
 * Ctrl+Alt+S. So entering studio mode writes the flag (see `rememberElementSwapForNextBoot`, called
 * from shell.ts) and the boot after that arms. The accepted, visible consequence: the first time,
 * one reload to arm.
 */
export const STUDIO_ELEMENT_SWAP_FLAG = 'collabStudioElementSwap';

const LIFECYCLE_CALLBACKS = [
  'connectedCallback',
  'disconnectedCallback',
  'adoptedCallback',
  'attributeChangedCallback',
] as const;

interface IEntry {
  readonly tag: string;
  readonly standIn: CustomElementConstructor;
  /** One mutable cell the stand-in's constructor closes over. */
  readonly slot: { impl: CustomElementConstructor };
  /** Own static keys a bare class has — anything else on the stand-in was written by someone else. */
  readonly baseline: Set<string>;
}

const entries = new Map<string, IEntry>();

let registry: IElementRegistry | null = null;
let nativeDefine: IElementRegistry['define'] | null = null;

/** Listeners hearing every (name, ctor) offered to `define` while a capture is running. A Set because
 *  captures can overlap; each caller must keep hearing for as long as its own `fn` runs. */
type DefineListener = (name: string, ctor: CustomElementConstructor) => void;
const captureListeners = new Set<DefineListener>();
let captureDepth = 0;

function ownStaticKeys(ctor: object): string[] {
  return [
    ...Object.getOwnPropertyNames(ctor),
    ...Object.getOwnPropertySymbols(ctor).map(symbol => symbol.toString()),
  ];
}

/**
 * Points every lookup that goes through the stand-in at `impl` — instances via the prototype chain,
 * statics via the constructor chain. `this.constructor` on an instance is the stand-in, so
 * `this.constructor.elementProperties` / `.elementStyles` reach the CURRENT version through here.
 */
function link(standIn: CustomElementConstructor, impl: CustomElementConstructor): void {
  Object.setPrototypeOf(standIn.prototype, impl.prototype);
  Object.setPrototypeOf(standIn, impl);
}

/**
 * Removes from the stand-in every own static it did not start with.
 *
 * Lit's `finalize()` runs with `this` = whatever class it was reached through, and writes
 * `finalized`, `elementProperties`, `elementStyles` and the attribute map AS OWN PROPERTIES of that
 * class. `define()` reads `observedAttributes`, whose getter calls `finalize()` — so the stand-in
 * gets Lit's bookkeeping for v1 written onto it, and an own property SHADOWS the impl the static
 * chain points at. Left in place, the symptom is subtle and nasty: a property added in v2 simply
 * does not exist, everything else works.
 *
 * Removed BY DIFFERENCE against the baseline, not against a list of names: in the production build
 * of Lit those names are minified (the phase-0 spike saw `finalized, elementProperties, _$Eh,
 * elementStyles` — `_$Eh` being the mangled attribute map), and a hardcoded list would rot on the
 * next Lit release without any visible failure. A bare `class extends HTMLElement {}` owns exactly
 * `length`, `name` and `prototype`; anything beyond that was written by someone who ran on the
 * stand-in and must go, so every lookup falls through to the impl again.
 */
function stripForeignStatics(entry: IEntry): string[] {
  const removed: string[] = [];
  for (const key of Object.getOwnPropertyNames(entry.standIn)) {
    if (entry.baseline.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(entry.standIn, key);
    if (!descriptor?.configurable) continue;
    delete (entry.standIn as unknown as Record<string, unknown>)[key];
    removed.push(key);
  }
  for (const symbol of Object.getOwnPropertySymbols(entry.standIn)) {
    if (entry.baseline.has(symbol.toString())) continue;
    const descriptor = Object.getOwnPropertyDescriptor(entry.standIn, symbol);
    if (!descriptor?.configurable) continue;
    delete (entry.standIn as unknown as Record<symbol, unknown>)[symbol];
    removed.push(symbol.toString());
  }
  return removed;
}

/**
 * The stand-in for one tag.
 *
 * The lifecycle callbacks are NOT inherited on demand: the browser reads them ONCE, off the
 * prototype given to `define`, and remembers the functions. A page that declares its own
 * `connectedCallback` would therefore keep running v1's forever. The stubs below are read at define
 * time (so the browser is happy) and resolve the real callback AT CALL TIME through the current
 * prototype link. Proven load-bearing by the phase-0 negative control.
 */
function createStandIn(impl: CustomElementConstructor, tag: string): IEntry {
  const slot = { impl };
  const standIn = class extends HTMLElement {
    // NO `super()` HERE, deliberately, and TypeScript has no way to express why: a derived
    // constructor may EITHER call super OR return an object, and this one returns an object. Calling
    // both would construct twice, which on the upgrade path is fatal — the browser's construction
    // stack holds ONE entry for the element being upgraded, and the second construction throws
    // InvalidStateError. The phase-0 spike proved this exact shape in a real browser, upgrade
    // included. `@ts-expect-error` and not `@ts-ignore` on purpose: it fails the build if the rule
    // it is silencing ever stops applying.
    // @ts-expect-error TS2377 — returning an object is the documented alternative to calling super.
    constructor() {
      // `new.target` is the stand-in, the only value HTMLElement's constructor accepts for a
      // registered definition; anything else is "Illegal constructor".
      return Reflect.construct(slot.impl, [], new.target as CustomElementConstructor);
    }
  };
  const baseline = new Set(ownStaticKeys(standIn));
  const prototype = standIn.prototype as unknown as Record<string, unknown>;
  for (const name of LIFECYCLE_CALLBACKS) {
    prototype[name] = function forwardLifecycle(this: HTMLElement, ...args: unknown[]): unknown {
      const current = Object.getPrototypeOf(standIn.prototype) as Record<string, unknown> | null;
      const handler = current?.[name];
      if (typeof handler === 'function') return (handler as (...a: unknown[]) => unknown).apply(this, args);
      return undefined;
    };
  }
  const entry: IEntry = { tag, standIn, slot, baseline };
  link(standIn, impl);
  return entry;
}

/**
 * Installs the swapping `define`. Idempotent; returns whether this call is the one that armed.
 *
 * ORDER IS EVERYTHING: a tag already registered can never be adopted, so this has to run before the
 * first `define` of the app — which is why bootstrap.ts imports this module on its FIRST line.
 */
export function armElementSwap(target: IElementRegistry = customElements): boolean {
  if (registry) return false;
  registry = target;
  nativeDefine = target.define.bind(target);

  target.define = (name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions) => {
    captureListeners.forEach(listener => listener(name, ctor));

    const existing = entries.get(name);
    if (existing) {
      // Inside a capture, a re-definition of an armed tag is the NEW VERSION of it arriving: the
      // caller collects it and applies it through `swapElementImpl`, in its own order. Outside a
      // capture, a duplicate `define` is a real bug and must keep failing exactly as it does today,
      // so it goes to the native define and throws.
      if (captureDepth > 0) return;
      nativeDefine!(name, ctor, options);
      return;
    }

    const entry = createStandIn(ctor, name);
    entries.set(name, entry);
    nativeDefine!(name, entry.standIn, options);
    // `define` just read `observedAttributes`, which made Lit finalize ON THE STAND-IN.
    stripForeignStatics(entry);
  };

  return true;
}

export function isElementSwapArmed(tag?: string): boolean {
  if (!registry) return false;
  return tag === undefined ? true : entries.has(tag);
}

/** Tags with a swappable implementation — what a live-update mode may promise. */
export function armedTags(): string[] {
  return [...entries.keys()];
}

/**
 * Points `tag` at a new implementation. `false` for a tag that was never armed — never throws,
 * because a live update reporting a problem is always better than one breaking the running app.
 *
 * Instances that ALREADY EXIST keep the fields and private brands their own (older) constructor gave
 * them, while their prototype chain now reaches the new code. That mix is only safe for as long as
 * it takes to replace them, which is why the caller remounts right after (see
 * studioLiveUpdateRemount.ts) instead of leaving live nodes straddling two versions.
 */
export function swapElementImpl(tag: string, impl: CustomElementConstructor): boolean {
  const entry = entries.get(tag);
  if (!entry || typeof impl !== 'function') return false;
  if (entry.slot.impl === impl) return true;

  entry.slot.impl = impl;
  link(entry.standIn, impl);
  // The new class was never registered, so nothing ever triggered its `observedAttributes` getter:
  // without this its `elementProperties`/`elementStyles` do not exist yet and the stand-in would
  // fall through to an unfinalized class.
  try {
    (impl as ILitLikeConstructor).finalize?.();
  } catch (err) {
    console.warn(`[elementSwap] finalize of the new "${tag}" implementation failed:`, err);
  }
  stripForeignStatics(entry);
  return true;
}

/**
 * Runs `fn` while every `define` it triggers is reported to `onDefine`.
 *
 * THE DEFINE IS THE ONLY PLACE THE (tag, class) PAIR EXISTS: Lit's `@customElement` decorator never
 * stores the tag on the class, so listening here is what removes the guessing the old mode had to do
 * (`pickElementClass` and its "first export whose prototype is an HTMLElement" fallback).
 *
 * Depth-counted rather than saved/restored per call: two live updates can overlap, and a
 * save/restore pair would leave the inner one's patched `define` installed permanently.
 */
export async function captureDefines<T>(fn: () => Promise<T>, onDefine: DefineListener): Promise<T> {
  captureListeners.add(onDefine);
  captureDepth += 1;
  try {
    return await fn();
  } finally {
    captureDepth -= 1;
    captureListeners.delete(onDefine);
  }
}

/** Writes the flag read at the next boot. Called when studio mode turns on (shell.ts). */
export function rememberElementSwapForNextBoot(): void {
  try {
    localStorage.setItem(STUDIO_ELEMENT_SWAP_FLAG, '1');
  } catch {
    // Private mode / blocked storage: the swap simply never arms, and the mode says so.
  }
}

export function isElementSwapRemembered(): boolean {
  try {
    return localStorage.getItem(STUDIO_ELEMENT_SWAP_FLAG) === '1';
  } catch {
    return false;
  }
}

// Arm at import time, and only for someone who has been in studio mode on this browser. A client
// session that never opened the studio keeps the native `define` and pays nothing.
if (typeof customElements !== 'undefined' && isElementSwapRemembered()) {
  armElementSwap();
}
