/// <mls fileReference="_102033_/l2/shared/elementSwapRegistry.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// The stand-in is `class extends HTMLElement`, and the module arms itself at import time when the
// studio flag is on. Both globals have to exist BEFORE the import — same trick
// studioLiveUpdateHotSwap.test.ts uses. No `localStorage` here on purpose: the module must NOT arm
// itself in a test, so every test arms explicitly against a fake registry.
class FakeHTMLElement {
  public readonly builtBy: string[] = [];
}
(globalThis as { HTMLElement?: unknown }).HTMLElement = FakeHTMLElement;

type RegistryModule = typeof import('/_102033_/l2/shared/elementSwapRegistry.js');

let cached: RegistryModule | undefined;
async function load(): Promise<RegistryModule> {
  cached ??= await import('/_102033_/l2/shared/elementSwapRegistry.js');
  return cached;
}

/** Stands in for `customElements`: records what really got registered. */
class FakeRegistry {
  public readonly registered = new Map<string, CustomElementConstructor>();
  public define(name: string, ctor: CustomElementConstructor): void {
    if (this.registered.has(name)) throw new Error(`NotSupportedError: "${name}" already defined`);
    // The browser reads `observedAttributes` here, which is what makes Lit finalize ON the class it
    // is given — the reason `stripForeignStatics` exists. Reading it keeps the fake honest.
    void (ctor as { observedAttributes?: unknown }).observedAttributes;
    this.registered.set(name, ctor);
  }
  public get(name: string): CustomElementConstructor | undefined {
    return this.registered.get(name);
  }
}

const registry = new FakeRegistry();

/** Arms once for the whole file; every test uses its own tag names. */
async function armed(): Promise<RegistryModule> {
  const mod = await load();
  mod.armElementSwap(registry as unknown as Parameters<RegistryModule['armElementSwap']>[0]);
  return mod;
}

const log: string[] = [];

class PageV1 extends (FakeHTMLElement as unknown as { new (): HTMLElement }) {
  public static tally = 'v1';
  public onlyInV1 = true;
  public label = 'v1';
  constructor() {
    super();
    log.push('ctor:v1');
  }
  public connectedCallback(): void { log.push('connected:v1'); }
  public whoAmI(): string { return 'v1'; }
  public goneInV2(): string { return 'still here'; }
}

class PageV2 extends (FakeHTMLElement as unknown as { new (): HTMLElement }) {
  public static tally = 'v2';
  #secret = 'brand-v2';
  public fieldFromV2 = 42;
  public label = 'v2';
  constructor() {
    super();
    log.push('ctor:v2');
  }
  public connectedCallback(): void { log.push('connected:v2'); }
  public whoAmI(): string { return 'v2'; }
  public readSecret(): string { return this.#secret; }
}

function build(tag: string): Record<string, unknown> {
  const StandIn = registry.get(tag);
  assert.ok(StandIn, `tag "${tag}" is not registered`);
  return new StandIn() as unknown as Record<string, unknown>;
}

// T1 — the whole point: a NEW instance is built by the NEW constructor, not patched into shape.
test('T1: after a swap, a new instance runs the new constructor and carries its fields', async () => {
  const mod = await armed();
  registry.define('t1-page', PageV1 as unknown as CustomElementConstructor);

  log.length = 0;
  assert.equal(mod.swapElementImpl('t1-page', PageV2 as unknown as CustomElementConstructor), true);
  const element = build('t1-page');

  assert.deepEqual(log, ['ctor:v2'], 'the v2 constructor is the one that ran');
  assert.equal(element.fieldFromV2, 42, 'a class field installed by v2 exists on the instance');
  assert.equal('onlyInV1' in element, false, 'a v1-only field must not survive');
});

// T2 — the case hotSwap has to REFUSE outright. A private field is branded by the class that
// declares it, and only a real construction can brand it.
test('T2: a #private field declared in the new version is readable by its own method', async () => {
  const mod = await armed();
  registry.define('t2-page', PageV1 as unknown as CustomElementConstructor);
  mod.swapElementImpl('t2-page', PageV2 as unknown as CustomElementConstructor);

  const element = build('t2-page') as unknown as { readSecret(): string };
  assert.equal(element.readSecret(), 'brand-v2');
});

// T3 — identity: the instance's prototype is the stand-in's, and the chain reaches the current impl.
test('T3: the instance prototype is the stand-in, and the chain reaches the current implementation', async () => {
  const mod = await armed();
  registry.define('t3-page', PageV1 as unknown as CustomElementConstructor);
  const StandIn = registry.get('t3-page')!;
  mod.swapElementImpl('t3-page', PageV2 as unknown as CustomElementConstructor);

  const element = build('t3-page');
  assert.equal(Object.getPrototypeOf(element), StandIn.prototype);
  assert.equal(element instanceof (PageV2 as unknown as new () => unknown), true);
  assert.equal(element instanceof (PageV1 as unknown as new () => unknown), false);
});

// T4 — `this.constructor` is the stand-in, so a static read has to fall through to the CURRENT impl.
// This is how Lit reaches `elementProperties` and `elementStyles` of the new version.
test('T4: a static read through the instance resolves on the current implementation', async () => {
  const mod = await armed();
  registry.define('t4-page', PageV1 as unknown as CustomElementConstructor);

  const before = build('t4-page');
  assert.equal((before.constructor as unknown as { tally: string }).tally, 'v1');

  mod.swapElementImpl('t4-page', PageV2 as unknown as CustomElementConstructor);
  const after = build('t4-page');
  assert.equal((after.constructor as unknown as { tally: string }).tally, 'v2');
});

// T5 — the lifecycle stubs. The browser reads these ONCE off the prototype it was given at define
// time; without stubs that forward at CALL time, a page declaring its own connectedCallback keeps
// running v1's forever. Proven in the browser with a negative control (task phase 0, check 4b).
test('T5: a lifecycle callback read off the registered prototype forwards to the current version', async () => {
  const mod = await armed();
  registry.define('t5-page', PageV1 as unknown as CustomElementConstructor);
  // Exactly what the browser does: grab the function once, keep it, call it later.
  const captured = (registry.get('t5-page')!.prototype as unknown as Record<string, () => void>).connectedCallback;
  assert.equal(typeof captured, 'function');

  mod.swapElementImpl('t5-page', PageV2 as unknown as CustomElementConstructor);
  const element = build('t5-page');
  log.length = 0;
  captured.call(element as unknown as HTMLElement);

  assert.deepEqual(log, ['connected:v2'], 'the callback the browser memorised reaches v2');
});

// T6 — a member DELETED in the new version is really gone, which an additive patch can never do.
test('T6: a member removed in the new version disappears', async () => {
  const mod = await armed();
  registry.define('t6-page', PageV1 as unknown as CustomElementConstructor);
  assert.equal(typeof build('t6-page').goneInV2, 'function');

  mod.swapElementImpl('t6-page', PageV2 as unknown as CustomElementConstructor);
  assert.equal(typeof build('t6-page').goneInV2, 'undefined');
});

// T7 — risk #2: Lit's finalize writes OWN statics on whatever class it runs on, and an own property
// shadows the impl the static chain points at. The names are minified in the production build, so
// the cleanup is by difference against the baseline, never against a list of names.
test('T7: a static written onto the stand-in at define time does not shadow the next version', async () => {
  const mod = await armed();
  class Finalizing extends (FakeHTMLElement as unknown as { new (): HTMLElement }) {
    public static tally = 'finalizing';
    public static get observedAttributes(): string[] {
      // Exactly Lit's shape: the getter finalizes, and finalize writes own statics on `this`.
      (this as unknown as Record<string, unknown>).elementProperties = new Map([['fromV1', {}]]);
      (this as unknown as Record<string, unknown>).finalized = true;
      return [];
    }
  }
  registry.define('t7-page', Finalizing as unknown as CustomElementConstructor);

  const StandIn = registry.get('t7-page')! as unknown as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(StandIn, 'elementProperties'),
    false,
    'what finalize wrote on the stand-in at define time must already be gone',
  );

  class WithNewProp extends (FakeHTMLElement as unknown as { new (): HTMLElement }) {
    public static elementProperties = new Map([['addedInV2', {}]]);
  }
  mod.swapElementImpl('t7-page', WithNewProp as unknown as CustomElementConstructor);
  const seen = (StandIn.elementProperties as Map<string, unknown>);
  assert.equal(seen.has('addedInV2'), true, 'the property added in v2 must be visible through the stand-in');
  assert.equal(seen.has('fromV1'), false, 'the v1 map must not still be shadowing');
});

// T8 — a swap never throws and never lies: an unarmed tag answers `false`.
test('T8: swapElementImpl on a tag that was never armed returns false instead of throwing', async () => {
  const mod = await armed();
  assert.equal(mod.swapElementImpl('t8-never-armed', PageV2 as unknown as CustomElementConstructor), false);
  assert.equal(mod.isElementSwapArmed('t8-never-armed'), false);
});

// T9 — the define is the ONLY place the (tag, class) pair exists, which is what removes the export
// guessing the old mode needed. Inside a capture, a re-define of an armed tag is collected and NOT
// registered; a tag seen for the first time still gets armed and registered.
test('T9: captureDefines reports tag -> class, swallows a re-define and still arms a new tag', async () => {
  const mod = await armed();
  registry.define('t9-page', PageV1 as unknown as CustomElementConstructor);

  const captured = new Map<string, CustomElementConstructor>();
  await mod.captureDefines(async () => {
    registry.define('t9-page', PageV2 as unknown as CustomElementConstructor);
    registry.define('t9-molecule', PageV2 as unknown as CustomElementConstructor);
  }, (name, ctor) => { captured.set(name, ctor); });

  assert.deepEqual([...captured.keys()], ['t9-page', 't9-molecule']);
  assert.equal(captured.get('t9-page'), PageV2 as unknown as CustomElementConstructor);
  assert.equal(mod.isElementSwapArmed('t9-molecule'), true, 'a tag defined for the first time is armed');
  assert.notEqual(
    registry.get('t9-molecule'),
    PageV2 as unknown as CustomElementConstructor,
    'what got registered is the stand-in, never the class itself',
  );
});

// T10 — outside a capture, a duplicate define is a real bug and must keep failing as it does today.
test('T10: outside a capture, defining an armed tag again still throws', async () => {
  const mod = await armed();
  registry.define('t10-page', PageV1 as unknown as CustomElementConstructor);
  assert.equal(mod.isElementSwapArmed('t10-page'), true);
  assert.throws(() => registry.define('t10-page', PageV2 as unknown as CustomElementConstructor), /already defined/u);
});

// T11 — arming is idempotent: a second call must not wrap the already-patched define again.
test('T11: armElementSwap is idempotent', async () => {
  const mod = await armed();
  assert.equal(mod.armElementSwap(registry as unknown as Parameters<RegistryModule['armElementSwap']>[0]), false);
  assert.equal(mod.armedTags().length > 0, true);
});

// T12 — risk #1, as a guard that fails if someone reorders the imports. Arriving after the first
// define of a tag means that tag is out of the live update for the whole session, and nothing about
// the symptom points at an import order.
test('T12: bootstrap.ts imports the registry on its first line', () => {
  const bootstrap = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'bootstrap.ts'),
    'utf8',
  );
  const firstImport = bootstrap.split(/\r?\n/u).find(line => line.startsWith('import '));
  assert.equal(firstImport, "import '/_102033_/l2/shared/elementSwapRegistry.js';");
});

// T13 — the flag is what gates everything, and the shell is what writes it.
test('T13: the shell arms the next boot when studio mode turns on', () => {
  const shell = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'shell.ts'),
    'utf8',
  );
  assert.match(shell, /import \{ rememberElementSwapForNextBoot \} from '\/_102033_\/l2\/shared\/elementSwapRegistry\.js';/u);
  assert.match(shell, /this\.studioModeOn = !this\.studioModeOn;[\s\S]{0,800}?rememberElementSwapForNextBoot\(\);/u);
});
