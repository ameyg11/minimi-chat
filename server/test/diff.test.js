import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashText,
  unchangedByHash,
  parseMoney,
  comparablePrice,
  pricesDiffer,
  diffClaims,
  findingsFromUnchanged,
} from '../src/agent/diff.js';

test('page hash ignores repeated whitespace and matches only itself', () => {
  const hash = hashText('Starter is  $15 / seat');
  assert.equal(hash, hashText('Starter is $15 / seat'));
  assert.equal(unchangedByHash(hash, hashText('Starter is $15 / seat')), true);
  assert.equal(unchangedByHash(hash, hashText('Starter is $20 / seat')), false);
  assert.equal(unchangedByHash('', hash), false);
});

test('same monthly price in different words is unchanged', () => {
  const findings = diffClaims(
    [{ entity: 'HubSpot', aspect: 'price', qualifier: 'starter per seat monthly', display: '$15/seat/month', period: 'month', observedAt: '2026-11-03', evidenceId: 'old' }],
    [{ entity: 'HubSpot', aspect: 'price', qualifier: 'monthly, starter, per seat', display: '$15 per seat monthly', period: 'month', observedAt: '2026-11-11', evidenceId: 'new', quote: '$15 per seat' }],
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, 'unchanged');
});

test('a higher seat price is a change', () => {
  const findings = diffClaims(
    [{ entity: 'HubSpot', aspect: 'price', qualifier: 'starter per seat', display: '$15 per seat/month', observedAt: '2026-11-03', evidenceId: 'old' }],
    [{ entity: 'HubSpot', aspect: 'price', qualifier: 'starter per seat', display: '$20 per seat/month', observedAt: '2026-11-11', evidenceId: 'new' }],
  );
  assert.equal(findings[0].status, 'changed');
  assert.equal(findings[0].before, '$15 per seat/month');
  assert.equal(findings[0].after, '$20 per seat/month');
});

test('annual and monthly prices compare only when both name a period', () => {
  const annual = parseMoney({ display: '$180 per year' });
  const monthly = parseMoney({ display: '$15 per month' });
  const compared = comparablePrice(annual, monthly);
  assert.equal(compared.ok, true);
  assert.equal(pricesDiffer(compared.left, compared.right), false);

  const bare = parseMoney({ display: '$15' });
  assert.equal(comparablePrice(bare, monthly).ok, false);
  const findings = diffClaims(
    [{ entity: 'Neon', aspect: 'price', qualifier: 'launch', display: '$15', observedAt: '2026-11-03', evidenceId: 'old' }],
    [{ entity: 'Neon', aspect: 'price', qualifier: 'launch', display: '$15 per month', observedAt: '2026-11-11', evidenceId: 'new' }],
  );
  assert.equal(findings[0].status, 'not_comparable');
});

test('a matching hash becomes unchanged without comparing prose', () => {
  const evidence = { _id: 'e2', url: 'https://neon.tech/pricing', domain: 'neon.tech', tier: 1, fetchedAt: '2026-11-11T00:00:00.000Z' };
  const findings = findingsFromUnchanged(
    [{ entity: 'Neon', aspect: 'price', qualifier: 'launch', display: '$0.106 per CU-hour', quote: 'Launch compute is $0.106 per CU-hour', evidenceId: 'e1', observedAt: '2026-11-03' }],
    evidence,
  );
  assert.equal(findings[0].status, 'unchanged');
  assert.equal(findings[0].before, findings[0].after);
  assert.equal(findings[0].persist.evidenceId, 'e2');
});

test('a minor release is not a big ship, a major launch is', () => {
  const minor = diffClaims(
    [],
    [{ entity: 'Neon', aspect: 'launch', qualifier: 'patch', display: 'Fixed a dashboard typo', magnitude: 'minor', observedAt: '2026-11-11', evidenceId: 'n' }],
  );
  assert.equal(minor[0].status, 'not_big');
  const major = diffClaims(
    [],
    [{ entity: 'Neon', aspect: 'launch', qualifier: 'ga', display: 'Neon Lakehouse is generally available', magnitude: 'major', observedAt: '2026-11-11', evidenceId: 'n' }],
  );
  assert.equal(major[0].status, 'changed');
});
