import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackPlan } from '../src/agent/plan.js';
import { buildQueries } from '../src/agent/research.js';

test('a pricing question searches each vendor pricing page, not the whole sentence', () => {
  const message = 'For a 20-person sales team, what do HubSpot, Pipedrive, and Attio charge per seat right now? Cite the pricing page.';
  const plan = fallbackPlan(message, { ranges: [], since: null });
  const queries = buildQueries(plan, { claims: [], evidence: [] });
  assert.deepEqual(queries.map((query) => query.query), [
    'HubSpot official pricing',
    'Pipedrive official pricing',
    'Attio official pricing',
  ]);
  assert.deepEqual(queries.map((query) => query.includeDomains[0]), [
    'hubspot.com',
    'pipedrive.com',
    'attio.com',
  ]);
});
