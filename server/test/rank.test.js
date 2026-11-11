import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitiesInText, rankSource } from '../src/search/rank.js';

const vendors = ['hubspot.com'];

test('vendor pricing and docs outrank the vendor blog, press, and forums', () => {
  assert.equal(rankSource('https://www.hubspot.com/pricing/starter', vendors).tier, 1);
  assert.equal(rankSource('https://legal.hubspot.com/changelog', vendors).tier, 1);
  assert.equal(rankSource('https://www.hubspot.com/blog/new-crm', vendors).tier, 2);
  assert.equal(rankSource('https://techcrunch.com/2026/11/01/hubspot', vendors).tier, 3);
  assert.equal(rankSource('https://example.com/hubspot-review', vendors).tier, 4);
  assert.equal(rankSource('https://www.reddit.com/r/sales/comments/1', vendors).tier, 5);
});

test('a sentence names HubSpot, Pipedrive, and Attio in the order they appear', () => {
  assert.deepEqual(
    entitiesInText('For a 20-person sales team, what do HubSpot, Pipedrive, and Attio charge per seat right now?'),
    ['HubSpot', 'Pipedrive', 'Attio'],
  );
});

test('a pricing path on a random site is not treated as the vendor', () => {
  assert.equal(rankSource('https://example.com/pricing', []).tier, 4);
});
