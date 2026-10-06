/// <mls fileReference="_102033_/l2/shared/collabBootContractGuard.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const L2_DIR = fileURLToPath(new URL('..', import.meta.url));
const CONTRACT = '/_102029_/l2/contracts/bootstrap.js';
const READS_BOOT = /window\.collabBoot\b/u;

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sources(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

test('a file that reads window.collabBoot imports the contract that declares it', () => {
  const offenders = sources(L2_DIR)
    .filter((file) => {
      const text = readFileSync(file, 'utf8');
      return READS_BOOT.test(text) && !text.includes(CONTRACT);
    })
    .map((file) => path.relative(L2_DIR, file));

  const why = 'the VM build typecheck is per project, so another project can compile this file without bringing the contract';
  assert.deepEqual(
    offenders,
    [],
    offenders.map((file) => `${file}: reads window.collabBoot without importing ${CONTRACT}; ${why}`).join('\n'),
  );
});
