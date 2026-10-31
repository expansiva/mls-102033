/// <mls fileReference="_102033_/l2/shared/elementSwapRegistryArmProbe.test.ts" enhancement="_blank" />
// Fresh process for T18–T20. Sets the cookie and the flag, then imports the registry.
// Loaded by the test runner it does nothing; the parent spawns it with ARM_PROBE=1.

if (process.env.ARM_PROBE === '1') {
  void probeArmOnImport();
}

async function probeArmOnImport(): Promise<void> {
  try {
    class ProbeHTMLElement {}
    (globalThis as { HTMLElement?: unknown }).HTMLElement = ProbeHTMLElement;
    (globalThis as { customElements?: unknown }).customElements = {
      define() { /* the arm only needs a registry to patch */ },
      get() { return undefined; },
    };
    const store = new Map<string, string>();
    if (process.env.ARM_FLAG === '1') store.set('collabStudioElementSwap', '1');
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: () => null,
      get length() { return store.size; },
    };
    (globalThis as { document?: { cookie: string } }).document = { cookie: process.env.ARM_COOKIE ?? '' };
    const mod = await import('/_102033_/l2/shared/elementSwapRegistry.js');
    process.stdout.write(mod.isElementSwapArmed() ? 'ARMED\n' : 'NATIVE\n');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
