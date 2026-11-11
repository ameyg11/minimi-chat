import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDates, dayKey } from '../src/memory/dates.js';

const now = new Date('2026-11-11T09:30:00.000Z');
const tz = 'Asia/Kolkata';

test('3 November is that calendar day in Asia/Kolkata', () => {
  const dates = resolveDates('What did I ask you on 3 November?', now, tz);
  assert.equal(dates.ranges.length, 1);
  assert.equal(dayKey(dates.ranges[0].ymd), '2026-11-03');
  assert.equal(dates.ranges[0].from.toISOString(), '2026-11-02T18:30:00.000Z');
  assert.equal(dates.ranges[0].to.toISOString(), '2026-11-03T18:30:00.000Z');
  assert.equal(dates.ranges[0].label, 'Tuesday, 3 November 2026');
});

test('last Tuesday is the most recent Tuesday, with the week before as fallback', () => {
  const dates = resolveDates('Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?', now, tz);
  assert.equal(dayKey(dates.ranges[0].ymd), '2026-11-10');
  assert.equal(dayKey(dates.ranges[0].fallback.ymd), '2026-11-03');
  assert.equal(dates.since, true);
});

test('on Monday is the most recent Monday before today', () => {
  const dates = resolveDates('On Monday we shortlisted 5 CRM tools.', now, tz);
  assert.equal(dayKey(dates.ranges[0].ymd), '2026-11-09');
  assert.equal(dayKey(dates.ranges[0].fallback.ymd), '2026-11-02');
});

test('last Tuesday on a Tuesday means the week before', () => {
  const tuesday = new Date('2026-11-10T09:30:00.000Z');
  const dates = resolveDates('last Tuesday', tuesday, tz);
  assert.equal(dayKey(dates.ranges[0].ymd), '2026-11-03');
});

test('yesterday and today are separate days', () => {
  const dates = resolveDates('What did I ask yesterday and today?', now, tz);
  const keys = dates.ranges.map((range) => dayKey(range.ymd)).sort();
  assert.deepEqual(keys, ['2026-11-10', '2026-11-11']);
});
