/// <mls fileReference="_102033_/l2/cbe/studioSplit.test.ts" enhancement="_blank" />
// The client layout surviving a studio session (Ctrl+Alt+S out of l2 used to leave the client at
// 50/50). There is no DOM in the l2 harness, so the spliter here is a fake that reproduces the rules
// the real component actually applies (mls-102041/l2/collab-spliter.ts): one stored profile per
// level, and the left panel forced to 375px on levels 3-7 only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIENT_LEFT_PX,
  applyClientSplit,
  resetStudioSplit,
  restoreStudioSplit,
  studioLevel,
} from '/_102033_/l2/cbe/studioSplit.js';

const VIEWPORT = 1600;
const SEPARATOR = 8;
/** collab-spliter lays the panels out inside the width minus its separator. */
const TOTAL = VIEWPORT - SEPARATOR;
const FORCED_LEVELS = [3, 4, 5, 6, 7];

(globalThis as unknown as { window: { innerWidth: number } }).window = { innerWidth: VIEWPORT };

interface FakeItem {
  classes: Set<string>;
  classList: { remove: (...names: string[]) => void };
}

function fakeItem(): FakeItem {
  const classes = new Set<string>(['hidden', 'closed']);
  return { classes, classList: { remove: (...names: string[]) => names.forEach((n) => classes.delete(n)) } };
}

interface FakeSpliter {
  attrs: Map<string, string>;
  /** localStorage['user-msplit'] — percentages, one slot per level. */
  store: Record<number, string>;
  /** collab-spliter's `_fullScreenData`. */
  fullscreen: string[];
  widths: { left: number; right: number };
  /** Ordered trace of what the module did, so ordering can be asserted. */
  log: string[];
  items: FakeItem[];
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  setFullScreen: (level: number, position: 'left' | 'right' | 'default') => void;
  querySelectorAll: (selector: string) => FakeItem[];
}

function currentLevel(s: FakeSpliter): number {
  return Number(s.attrs.get('level') ?? '7');
}

/** collab-spliter's `_savePreferencesByLevel`: the CURRENT level is the slot written. */
function save(s: FakeSpliter): void {
  const lvl = currentLevel(s);
  const fs = s.fullscreen[lvl] ?? '';
  if (fs === 'left' || fs === 'right') return;
  const pct = (px: number) => ((px / TOTAL) * 100).toFixed(2);
  s.store[lvl] = `${pct(s.widths.left)},${pct(s.widths.right)}`;
}

function setWidths(s: FakeSpliter, left: number, right: number): void {
  s.widths = { left, right };
  s.attrs.set('msplit', `${left},${right}`);
  save(s);
}

/** collab-spliter's `_loadUserPreferenceByLevel`. */
function load(s: FakeSpliter): void {
  const lvl = currentLevel(s);
  const fs = s.fullscreen[lvl] ?? '';
  let leftPct = 50;
  let rightPct = 50;
  if (fs === 'left') {
    leftPct = 100;
    rightPct = 0;
  } else if (fs === 'right') {
    leftPct = 0;
    rightPct = 100;
  } else {
    const stored = s.store[lvl];
    if (stored) {
      const [a, b] = stored.split(',');
      leftPct = Number(a);
      rightPct = Number(b);
    }
  }
  let left = (TOTAL / 100) * leftPct;
  let right = (TOTAL / 100) * rightPct;
  if (FORCED_LEVELS.includes(lvl) && fs !== 'left' && fs !== 'right') {
    const d = left - CLIENT_LEFT_PX;
    left = CLIENT_LEFT_PX;
    right = right + d;
  }
  setWidths(s, left, right);
}

function fakeSpliter(): FakeSpliter {
  const s: FakeSpliter = {
    attrs: new Map(),
    store: {},
    fullscreen: ['', '', '', '', '', '', '', ''],
    widths: { left: 0, right: 0 },
    log: [],
    items: [fakeItem(), fakeItem()],
    getAttribute: (name) => s.attrs.get(name) ?? null,
    setAttribute: (name, value) => {
      s.log.push(`${name}=${value}`);
      if (name === 'level') {
        if (s.attrs.get(name) === value) return; // lit only reacts to a real change
        s.attrs.set(name, value);
        load(s);
        return;
      }
      if (name === 'msplit') {
        s.attrs.set(name, value);
        const [a, b] = value.split(',');
        s.widths = { left: Number(a), right: Number(b) };
        save(s);
        return;
      }
      if (name === 'msplit-fullscreen') {
        if (s.attrs.get(name) === value) return;
        s.attrs.set(name, value);
        s.fullscreen = value.split(',');
        load(s);
        return;
      }
      s.attrs.set(name, value);
    },
    setFullScreen: (lvl, position) => {
      s.log.push(`setFullScreen(${lvl},${position})`);
      s.fullscreen[lvl] = position === 'default' ? '' : position;
      s.attrs.set('msplit-fullscreen', s.fullscreen.join(','));
      load(s);
    },
    querySelectorAll: () => s.items,
  };
  return s;
}

interface FakeNav1 {
  actualLevel?: number;
  getAttribute: (name: string) => string | null;
}

function fakeHost(spliter: FakeSpliter | null, nav1: FakeNav1 | null): ParentNode {
  return {
    querySelector: (selector: string) => {
      if (selector === 'collab-spliter') return spliter;
      if (selector === 'collab-nav-1') return nav1;
      return null;
    },
  } as unknown as ParentNode;
}

/** What collab-nav-1 does on a tab change (mls-102041/l2/collab-nav-1.ts, `_fireChangeLevel`). */
function navigateTo(spliter: FakeSpliter, nav1: FakeNav1, lvl: number): void {
  nav1.actualLevel = lvl;
  spliter.setAttribute('level', String(lvl));
}

test('the client layout survives a studio session that ended on l2', () => {
  resetStudioSplit();
  const spliter = fakeSpliter();
  const nav1: FakeNav1 = { actualLevel: 7, getAttribute: () => null };
  const host = fakeHost(spliter, nav1);

  // Boot: the structure applies the client split.
  applyClientSplit(host);
  assert.equal(spliter.widths.left, CLIENT_LEFT_PX);
  const clientRight = spliter.widths.right;

  // Studio mode, then down to l2 — level 2 is outside the forced range, so it lays out 50/50.
  navigateTo(spliter, nav1, 2);
  assert.equal(spliter.widths.left, TOTAL / 2);
  assert.equal(spliter.widths.right, TOTAL / 2);

  // Ctrl+Alt+S back to the client: this was the bug — the client stayed at 50/50.
  applyClientSplit(host);
  assert.equal(spliter.widths.left, CLIENT_LEFT_PX);
  assert.equal(spliter.widths.right, clientRight);

  // And back in, the studio is where the user left it.
  restoreStudioSplit(host);
  assert.equal(spliter.widths.left, TOTAL / 2);
  assert.equal(spliter.widths.right, TOTAL / 2);
});

test('the client split is saved to level 7, never to the studio level the user was on', () => {
  resetStudioSplit();
  const spliter = fakeSpliter();
  const nav1: FakeNav1 = { actualLevel: 7, getAttribute: () => null };
  const host = fakeHost(spliter, nav1);

  applyClientSplit(host);
  navigateTo(spliter, nav1, 2);
  const studioProfile = spliter.store[2];
  assert.equal(studioProfile, '50.00,50.00');

  applyClientSplit(host);

  // The whole reason the spliter's `level` is moved to 7 BEFORE msplit is written: writing 375px
  // into slot 2 would make the next visit to l2 open at the client width.
  assert.equal(spliter.store[2], studioProfile);
  assert.ok(spliter.store[7]?.startsWith('23.'), `level 7 holds the client split, got ${spliter.store[7]}`);

  const levelIndex = spliter.log.indexOf('level=7');
  const msplitIndex = spliter.log.findIndex((entry) => entry.startsWith('msplit=375'));
  assert.ok(levelIndex > -1 && msplitIndex > levelIndex, `level must be parked before msplit: ${spliter.log.join(' | ')}`);
});

test('the studio home being left-fullscreen does not follow the user into client mode', () => {
  resetStudioSplit();
  const spliter = fakeSpliter();
  const nav1: FakeNav1 = { actualLevel: 7, getAttribute: () => null };
  const host = fakeHost(spliter, nav1);

  applyClientSplit(host);
  // serviceStart / collab-start-l7 pin the studio home to the left.
  spliter.setFullScreen(7, 'left');
  assert.equal(spliter.widths.right, 0);
  navigateTo(spliter, nav1, 2);

  applyClientSplit(host);
  assert.equal(spliter.widths.left, CLIENT_LEFT_PX, 'the app must be visible in client mode');
  assert.ok(spliter.widths.right > 0);

  // On the way back in, the studio gets its flags back.
  restoreStudioSplit(host);
  assert.equal(spliter.fullscreen[7], 'left');
  navigateTo(spliter, nav1, 7);
  assert.equal(spliter.widths.right, 0);
});

test('a panel the spliter had collapsed is reopened for the client', () => {
  resetStudioSplit();
  const spliter = fakeSpliter();
  const host = fakeHost(spliter, { actualLevel: 2, getAttribute: () => null });

  applyClientSplit(host);
  for (const item of spliter.items) {
    assert.equal(item.classes.has('hidden'), false);
    assert.equal(item.classes.has('closed'), false);
  }
});

test('re-entering without a client detour leaves the fullscreen flags alone', () => {
  resetStudioSplit();
  const spliter = fakeSpliter();
  const nav1: FakeNav1 = { actualLevel: 5, getAttribute: () => null };
  const host = fakeHost(spliter, nav1);

  spliter.setFullScreen(7, 'left');
  const before = spliter.attrs.get('msplit-fullscreen');
  restoreStudioSplit(host);
  assert.equal(spliter.attrs.get('msplit-fullscreen'), before);
  assert.equal(spliter.attrs.get('level'), '5');
});

test('the nav1 level is read from the tab when the element is not upgraded yet', () => {
  const tabs: Record<string, number> = { '0': 7, '2': 5, '5': 2, '7': 0 };
  for (const [tab, expected] of Object.entries(tabs)) {
    const host = fakeHost(null, { getAttribute: (name) => (name === 'tabindexactive' ? tab : null) });
    assert.equal(studioLevel(host), expected, `tab ${tab}`);
  }
});

test('nothing blows up when the structure is not there', () => {
  resetStudioSplit();
  const empty = fakeHost(null, null);
  assert.doesNotThrow(() => applyClientSplit(empty));
  assert.doesNotThrow(() => restoreStudioSplit(empty));
  assert.equal(studioLevel(empty), null);
});
