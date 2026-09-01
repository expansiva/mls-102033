/// <mls fileReference="_102033_/l2/cbe/studioTailwind.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  JIT_SUSPENDED_MEDIA,
  STUDIO_TAILWIND_CSS,
  STUDIO_TAILWIND_THEME,
  TAILWIND_JIT_URL,
  TAILWIND_JIT_VERSION,
  applyJitSuspension,
  classNamesFromSelectors,
  missingFromBuiltCss,
} from '/_102033_/l2/cbe/studioTailwind.js';

// mls-102033/l2/cbe/ -> monorepo root
const REPO = new URL('../../../', import.meta.url);

function readJson(relative: string): any {
  return JSON.parse(readFileSync(new URL(relative, REPO), 'utf8'));
}

function parts(version: string): number[] {
  return version.split('.').map(Number);
}

/** `pin >= floor`, both exact x.y.z. */
function atLeast(pin: string, floor: string): boolean {
  const [pinMajor, pinMinor, pinPatch] = parts(pin);
  const [floorMajor, floorMinor, floorPatch] = parts(floor);
  if (pinMajor !== floorMajor) return pinMajor > floorMajor;
  if (pinMinor !== floorMinor) return pinMinor > floorMinor;
  return pinPatch >= floorPatch;
}

// The two packages that decide what the BUILD generates: the CLI `build.mjs` runs
// (`pnpm exec tailwindcss`) and the engine it compiles with.
const BUILD_PACKAGES = ['tailwindcss', '@tailwindcss/cli'];

test('the JIT pin is exact and matches the tailwind the build resolves', () => {
  assert.match(TAILWIND_JIT_VERSION, /^\d+\.\d+\.\d+$/u, 'the pin must be an exact version, not a range');
  assert.equal(TAILWIND_JIT_URL, `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@${TAILWIND_JIT_VERSION}`);

  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  for (const name of BUILD_PACKAGES) {
    const declared: string | undefined = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name];
    assert.ok(declared, `${name} must stay declared in package.json`);

    // Declared as a caret range: same major, and never OLDER than the floor. Raising the floor in
    // package.json without bumping the pin here fails right at this assertion.
    const floor = declared.replace(/^[^\d]*/u, '');
    assert.match(declared, /^\^?\d+\.\d+\.\d+$/u, `${name}: unexpected range syntax "${declared}"`);
    assert.equal(parts(TAILWIND_JIT_VERSION)[0], parts(floor)[0], `${name}: major differs from the pin`);
    assert.ok(atLeast(TAILWIND_JIT_VERSION, floor), `${name}: the pin ${TAILWIND_JIT_VERSION} is older than the declared floor ${floor}`);

    // And the version actually resolved (the lockfile IS what the build runs).
    const resolved: string | undefined = lock.packages?.[`node_modules/${name}`]?.version;
    assert.ok(resolved, `${name} must be present in package-lock.json`);
    assert.equal(
      TAILWIND_JIT_VERSION,
      resolved,
      `${name} resolves to ${resolved} but the studio JIT is pinned to ${TAILWIND_JIT_VERSION} — the studio would stop rendering what the build generates`,
    );
  }
});

test('the css handed to the JIT carries the dark class variant and the app theme', () => {
  // Without the variant, `dark:` follows prefers-color-scheme instead of `.dark` — and `dark:` is the
  // largest slice of the classes that have no rule in the built sheet.
  assert.match(STUDIO_TAILWIND_CSS, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);/u);
  assert.ok(STUDIO_TAILWIND_CSS.includes('@import "tailwindcss";'));
  assert.ok(STUDIO_TAILWIND_CSS.includes(STUDIO_TAILWIND_THEME));
});

test('the theme copy still matches the @theme block of the app tailwind.css', () => {
  // The served sheet is the COMPILED one (@theme already lowered), so the block cannot be read at
  // runtime and lives here as a copy. This is the guard against that copy going stale.
  const source = readFileSync(new URL('mls-102033/l2/shared/tailwind.css', REPO), 'utf8');
  const block = source.match(/@theme\s*\{[^}]*\}/u);
  assert.ok(block, 'tailwind.css must keep an @theme block');
  assert.equal(
    STUDIO_TAILWIND_THEME.replace(/\s+/gu, ' ').trim(),
    block[0].replace(/\s+/gu, ' ').trim(),
    'STUDIO_TAILWIND_THEME drifted from mls-102033/l2/shared/tailwind.css',
  );
});

test('class names are read out of escaped tailwind selectors', () => {
  const names = classNamesFromSelectors([
    '.text-gray-400',
    ':where(.dark, .dark *) .dark\\:text-gray-300',
    '.w-\\[10px\\]',
    '.p-1\\.5',
    '.border-gray-200, .border-gray-300',
    'collab-nav-2 .region.header > .brand',
  ]);

  assert.equal(names.has('text-gray-400'), true);
  assert.equal(names.has('dark:text-gray-300'), true, 'the escaped colon must be undone');
  assert.equal(names.has('dark'), true, 'the variant wrapper class is a class too');
  assert.equal(names.has('w-[10px]'), true);
  assert.equal(names.has('p-1.5'), true);
  assert.deepEqual(
    ['border-gray-200', 'border-gray-300'].filter((name) => names.has(name)),
    ['border-gray-200', 'border-gray-300'],
    'a comma-separated selector yields every class',
  );
  assert.equal(names.has('brand'), true);
  assert.equal(names.has('header'), true);
});

test('the audit reports only classes that are used, known to tailwind, and absent from the built sheet', () => {
  const used = ['text-gray-400', 'dark:text-gray-300', 'shell-error-card', 'text-aura-ink'];
  const jit = new Set(['text-gray-400', 'dark:text-gray-300', 'text-aura-ink', 'flex']);
  const built = new Set(['text-aura-ink', 'flex']);

  assert.deepEqual(missingFromBuiltCss(used, jit, built), ['dark:text-gray-300', 'text-gray-400']);
  // Not a utility (app css class) -> not reported; generated by the build -> not reported.
  assert.equal(missingFromBuiltCss(used, jit, built).includes('shell-error-card'), false);
  assert.equal(missingFromBuiltCss(used, jit, built).includes('text-aura-ink'), false);
  // Silent when the built sheet covers everything in use.
  assert.deepEqual(missingFromBuiltCss(used, jit, new Set([...jit])), []);
});

test('leaving studio mode makes the JIT sheet inert, and coming back makes it live again', () => {
  // Only the two calls the module makes on the style ELEMENT — the point of using an attribute is that
  // it survives the JIT rewriting the style's textContent on every rebuild, which drops sheet.disabled.
  const attrs = new Map<string, string>();
  const style = {
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  };

  applyJitSuspension(style, true);
  assert.equal(attrs.get('media'), JIT_SUSPENDED_MEDIA);
  assert.equal(JIT_SUSPENDED_MEDIA, 'not all', 'the media query must match nothing at all');

  applyJitSuspension(style, false);
  assert.equal(attrs.has('media'), false, 'no leftover media, or the sheet would stay scoped');

  // Idempotent both ways: the shell re-publishes data-studio-mode on every update().
  applyJitSuspension(style, false);
  assert.equal(attrs.has('media'), false);
  applyJitSuspension(style, true);
  applyJitSuspension(style, true);
  assert.equal(attrs.get('media'), JIT_SUSPENDED_MEDIA);
});
