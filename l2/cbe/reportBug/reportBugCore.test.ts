/// <mls fileReference="_102033_/l2/cbe/reportBug/reportBugCore.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBugMessage,
  CONSOLE_SEND,
  networkStatus,
  parseBugView,
  type IBugView,
} from '/_102033_/l2/cbe/reportBug/reportBugCore.js';

function bug(overrides: Partial<IBugView> = {}): IBugView {
  return {
    capturedAt: '2026-11-09T12:00:00.000Z',
    user: 'ana',
    href: 'https://app/x',
    userAgent: 'ua',
    viewport: '800x600',
    mls: { actual: [] },
    boot: {},
    console: [],
    network: [],
    description: 'clicked save',
    ...overrides,
  };
}

/** The JSON inside the ```BUG block, as the chat parser would cut it (first ``` after the opening). */
function blockBody(message: string): string {
  const start = message.indexOf('```BUG\n') + '```BUG\n'.length;
  return message.slice(start, message.indexOf('```', start));
}

test('a console text with ``` does not close the BUG block early, and reads back intact', () => {
  const text = 'model said ```js\nx()\n``` done';
  const message = buildBugMessage(bug({ console: [{ ts: '2026-11-09T12:00:00.000Z', level: 'warn', text }] }));
  const view = parseBugView(blockBody(message));
  assert.ok(view);
  assert.equal(view.console[0].text, text);
});

test('the message carries only the last console entries and no screenshot bytes', () => {
  const console = Array.from({ length: CONSOLE_SEND + 20 }, (_, i) => ({ ts: '', level: 'error', text: `e${i}` }));
  const message = buildBugMessage(bug({ console, screenshot: 'data:image/jpeg;base64,AAAA' }));
  const view = parseBugView(blockBody(message));
  assert.ok(view);
  assert.equal(view.console.length, CONSOLE_SEND);
  assert.equal(view.console.at(-1)?.text, `e${CONSOLE_SEND + 19}`);
  assert.equal(view.screenshot?.startsWith('data:image'), false);
});

test('a hand-edited bug renders with dashes instead of throwing', () => {
  const view = parseBugView(JSON.stringify({ mls: { actual: 'x' }, console: [{ ts: {} }, null], network: [{}] }));
  assert.ok(view);
  assert.deepEqual(view.mls.actual, []);
  assert.deepEqual(view.console, [{ ts: '', level: '-', text: '' }]);
  assert.equal(view.network[0].url, '-');
  assert.equal(view.capturedAt, '-');
});

test('invalid JSON or a non-object is rejected', () => {
  assert.equal(parseBugView('{'), undefined);
  assert.equal(parseBugView('[1]'), undefined);
  assert.equal(parseBugView('null'), undefined);
});

test('a failed request (status 0) is flagged as failed', () => {
  assert.equal(networkStatus(0), 'failed');
  assert.equal(networkStatus(404), 404);
  assert.equal(networkStatus(undefined), '-');
});
