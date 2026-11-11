import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachThreadEntities, fallbackPlan } from '../src/agent/plan.js';
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

test('a follow-up about those three tools checks each vendor pricing page and changelog', () => {
  const earlier = 'For a 20-person sales team, what do HubSpot, Pipedrive, and Attio charge per seat right now?';
  const plan = attachThreadEntities({
    topic: 'CRM tools',
    entities: [],
    steps: [{ type: 'delta', aspects: ['price', 'launch'], entities: [], queries: [], useDate: false, since: true }],
  }, [{ role: 'user', content: earlier, entities: [] }], 'Those three CRM tools we looked at for the 20-person sales team. Has any of them changed pricing or shipped something big since?');
  const queries = buildQueries({
    ...plan,
    steps: [{
      type: 'research',
      aspects: ['price', 'launch'],
      entities: plan.entities,
      queries: [],
    }],
  }, { claims: [], evidence: [] });
  assert.deepEqual(plan.entities, ['HubSpot', 'Pipedrive', 'Attio']);
  assert.deepEqual(queries.map((query) => query.query), [
    'HubSpot official pricing',
    'HubSpot official changelog',
    'Pipedrive official pricing',
    'Pipedrive official changelog',
    'Attio official pricing',
    'Attio official changelog',
  ]);
});
