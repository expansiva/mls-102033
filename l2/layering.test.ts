/// <mls fileReference="_102033_/l2/layering.test.ts" enhancement="_blank" />
// The one rule this project has about its neighbours, as a test (TASK-102033-studio-to-102020).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const L2_DIR = fileURLToPath(new URL('.', import.meta.url));

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sources(full));
    else if (entry.endsWith('.ts')) found.push(full);
  }
  return found;
}

test('the master frontend never imports the Studio plugin', () => {
  // This is what the studio folder moving out bought, and the only thing that keeps it bought: 102033
  // is the runtime every client app carries, 102020 is the authoring plugin. The plugin depends on
  // the runtime; the runtime must not know the plugin exists.
  //
  // Imports only. A MENTION is documentation — `studioServices.ts` explains the mechanism with the
  // real widget as the example, and a test fixture uses a `_102020_` widget on purpose. What creates
  // a dependency is `from '/_102020_/…'` or `import('/_102020_/…')`.
  const importsPlugin = /(?:from|import\s*\()\s*['"]\/_102020_/u;
  const offenders = sources(L2_DIR)
    // This file quotes the forbidden shape to explain it, which is the one honest exception.
    .filter((file) => path.basename(file) !== 'layering.test.ts')
    .filter((file) => importsPlugin.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(L2_DIR, file));

  assert.deepEqual(offenders, [], 'these files pull the Studio plugin into the master frontend');
});

test('the editing tools are reached through the slot, not by name', () => {
  // The inverse of the rule above: whoever hosts the app publishes where it is, and whoever provides
  // editing registers. `serviceClientApp` used to `import()` the editor directly.
  const service = readFileSync(path.join(L2_DIR, 'cbe/serviceClientApp.ts'), 'utf8');
  assert.match(service, /publishEditHost\(/u, 'it publishes the state');
  assert.match(service, /loadStudioTools\(/u, 'and asks the plugins for a tool');

  // Code lines only: the file EXPLAINS that it used to own a StudioEditor, and that history is worth
  // keeping. What must be gone is the code that touched one.
  const code = service.split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'));
  const uses = code.filter((line) => /StudioEditor|StudioLiveUpdateWatcher/u.test(line));
  assert.deepEqual(uses, [], 'the service names no tool');
});
