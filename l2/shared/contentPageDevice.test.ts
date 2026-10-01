/// <mls fileReference="_102033_/l2/shared/contentPageDevice.test.ts" enhancement="_blank" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeContentPageDeviceChange } from '/_102033_/l2/shared/contentPageDevice.js';
import { describeContentPageGenomeChange } from '/_102033_/l2/shared/contentPageGenome.js';

const desktop = {
  tag: 'agenda-clinica--web--desktop--page11--agenda-102047',
  entrypoint: '/_102047_/l2/agendaClinica/web/desktop/page11/agenda.js',
};

test('desktop renderer swaps both segments to the mobile sibling', () => {
  const change = describeContentPageDeviceChange(desktop, 'mobile');
  assert.equal(change.ok, true);
  assert.equal(change.nextTag, 'agenda-clinica--web--mobile--page11--agenda-102047');
  assert.equal(change.nextEntrypoint, '/_102047_/l2/agendaClinica/web/mobile/page11/agenda.js');
  assert.equal(change.reason, '');
});

test('mobile renderer swaps back to desktop — widening the window is reversible', () => {
  const mobile = describeContentPageDeviceChange(desktop, 'mobile');
  const back = describeContentPageDeviceChange(
    { tag: mobile.nextTag, entrypoint: mobile.nextEntrypoint },
    'desktop',
  );
  assert.equal(back.ok, true);
  assert.equal(back.nextTag, desktop.tag);
  assert.equal(back.nextEntrypoint, desktop.entrypoint);
});

test('already on the requested device is a no-op success', () => {
  const change = describeContentPageDeviceChange(desktop, 'desktop');
  assert.equal(change.ok, true);
  assert.equal(change.nextTag, desktop.tag);
  assert.equal(change.nextEntrypoint, desktop.entrypoint);
  assert.equal(change.reason, '');
});

test('a renderer outside the folder contract is named, not invented', () => {
  const noTagSegment = describeContentPageDeviceChange({
    tag: 'agenda-clinica--page11--agenda-102047',
    entrypoint: '/_102047_/l2/agendaClinica/web/desktop/page11/agenda.js',
  }, 'mobile');
  assert.equal(noTagSegment.ok, false);
  assert.match(noTagSegment.reason, /no --web--<device>-- segment/u);

  const noEntrypointSegment = describeContentPageDeviceChange({
    tag: 'agenda-clinica--web--desktop--page11--agenda-102047',
    entrypoint: '/_102047_/l2/agendaClinica/page11/agenda.js',
  }, 'mobile');
  assert.equal(noEntrypointSegment.ok, false);
  assert.match(noEntrypointSegment.reason, /no \/web\/<device>\/ segment/u);
});

test('missing renderer is named, not silent', () => {
  const change = describeContentPageDeviceChange(undefined, 'mobile');
  assert.equal(change.ok, false);
  assert.match(change.reason, /no active content renderer/u);
});

test('device applies after the genome — Ctrl+Alt+E keeps working on the phone', () => {
  const genome = describeContentPageGenomeChange(desktop, 21);
  assert.equal(genome.ok, true);
  const change = describeContentPageDeviceChange(
    { tag: genome.nextTag, entrypoint: genome.nextEntrypoint },
    'mobile',
  );
  assert.equal(change.ok, true);
  assert.equal(change.nextTag, 'agenda-clinica--web--mobile--page21--agenda-102047');
  assert.equal(change.nextEntrypoint, '/_102047_/l2/agendaClinica/web/mobile/page21/agenda.js');
});
