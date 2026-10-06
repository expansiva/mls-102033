/// <mls fileReference="_102033_/l2/shared/siteProjectGuard.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const l2Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Exact boot `projectId` reads that belong to the served page owner, not the site. */
const allowedCount: Record<string, { count: number; why: string }> = {
  'shared/shell.ts': { count: 1, why: 'setDS: design system of the page owner' },
  'shared/layout/aura-header-base.ts': { count: 2, why: 'action-event detail and renderDesignSystemSwitcher: page owner' },
  'shared/layout/aura-header.ts': { count: 1, why: 'header label: page owner' },
};

const readPattern = /(bootConfig|collabBoot)\??\.projectId/g;
const quoted = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;

function listSources(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listSources(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
}

function countReads(source: string): number {
  let n = 0;
  for (const line of source.split('\n')) {
    const matches = line.replace(quoted, '').match(readPattern);
    if (matches) n += matches.length;
  }
  return n;
}

test('boot projectId reads stay at the listed counts', () => {
  const files: string[] = [];
  listSources(l2Root, files);
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const rel = path.relative(l2Root, file).split(path.sep).join('/');
    const n = countReads(readFileSync(file, 'utf8'));
    seen.add(rel);
    const allowed = allowedCount[rel];
    if (allowed) {
      if (n !== allowed.count) {
        problems.push(
          `${rel}: expected ${allowed.count} (${allowed.why}), found ${n}. use siteProjectFromBoot when the use is Studio or the site`,
        );
      }
    } else if (n !== 0) {
      problems.push(
        `${rel}: expected 0, found ${n}. use siteProjectFromBoot when the use is Studio or the site`,
      );
    }
  }

  for (const rel of Object.keys(allowedCount)) {
    if (!seen.has(rel)) {
      problems.push(
        `${rel}: expected ${allowedCount[rel].count} (${allowedCount[rel].why}), found 0. use siteProjectFromBoot when the use is Studio or the site`,
      );
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});
