import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaims, scrubUnsourcedMoney } from '../src/agent/verify.js';

const page = {
  _id: 'e1',
  tier: 1,
  excerpt: 'The Starter plan is $20 per seat/month billed monthly.',
  quote: '',
};

test('a price with no quote is dropped', () => {
  const { kept, dropped } = verifyClaims([
    { evidenceId: 'e1', aspect: 'price', quote: '', display: '$20 per seat/month', tier: 1 },
  ], new Map([['e1', page]]));
  assert.equal(kept.length, 0);
  assert.equal(dropped[0].reason, 'no quote');
});

test('a quote that is not on the page is dropped', () => {
  const { kept, dropped } = verifyClaims([
    { evidenceId: 'e1', aspect: 'price', quote: 'Starter is $20 per seat/month on this other page.', display: '$20 per seat/month' },
  ], new Map([['e1', page]]));
  assert.equal(kept.length, 0);
  assert.equal(dropped[0].reason, 'quote not on page');
});

test('a forum price cannot stand alone', () => {
  const reddit = { _id: 'r1', tier: 5, excerpt: 'I think starter is $20 per seat/month now.', quote: '' };
  const { kept, dropped } = verifyClaims([
    { evidenceId: 'r1', aspect: 'price', quote: 'starter is $20 per seat/month now', display: '$20 per seat/month' },
  ], new Map([['r1', reddit]]));
  assert.equal(kept.length, 0);
  assert.equal(dropped[0].reason, 'price needs a primary or press source');
});

test('a primary quote that contains the number is kept', () => {
  const { kept } = verifyClaims([
    {
      evidenceId: 'e1',
      aspect: 'price',
      quote: 'The Starter plan is $20 per seat/month billed monthly.',
      display: '$20 per seat/month',
    },
  ], new Map([['e1', page]]));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].tier, 1);
});

test('a fractional price matches the quote even when the decimals differ in trailing zeros', () => {
  const { kept } = verifyClaims([
    {
      evidenceId: 'e1',
      aspect: 'price',
      quote: 'Compute is $0.106 per CU-hour on the Launch plan.',
      display: '$0.106 per CU-hour',
    },
  ], new Map([['e1', { _id: 'e1', tier: 1, excerpt: 'Compute is $0.106 per CU-hour on the Launch plan.', quote: '' }]]));
  assert.equal(kept.length, 1);
});

test('a currency amount in the reply is removed when no quote contains it', () => {
  const { prose, dropped } = scrubUnsourcedMoney(
    'Neon is $19 per hour. The docs agree.',
    ['Launch is $5 a month.'],
  );
  assert.equal(dropped, 1);
  assert.equal(prose.includes('$19'), false);
  assert.match(prose, /docs agree/);
});
