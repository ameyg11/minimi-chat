import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachThreadEntities } from '../src/agent/plan.js';
import { comparisonRows, missingPrimary, teamSize, withTeamTotals } from '../src/agent/report.js';

test('a stored claim names a product that is not in the vendor list', () => {
  const plan = attachThreadEntities({
    entities: [],
    steps: [{ type: 'delta', aspects: ['price'], entities: [], queries: [], useDate: false, since: true }],
  }, [
    { role: 'user', content: 'How much is Postgres hosting?', entities: [] },
  ], 'Has that Postgres host changed price since?', [
    { entity: 'PlanetScale', qualifier: 'Postgres hosting', display: '$29 per month' },
  ]);
  assert.deepEqual(plan.entities, ['PlanetScale']);
});

test('a 20-person team turns a per-seat price into a monthly total', () => {
  assert.equal(teamSize([{ key: 'team', value: '20-person sales team' }], []), 20);
  const [finding] = withTeamTotals([
    { entity: 'HubSpot', aspect: 'price', qualifier: 'Starter per seat', after: '$15 per seat/month', quote: '$15 per seat/month', status: 'sourced', note: '' },
  ], 20);
  assert.equal(finding.teamTotal, 300);
  assert.match(finding.note, /20 seats/);
});

test('two products become one comparison table', () => {
  const rows = comparisonRows([
    { entity: 'HubSpot', aspect: 'price', qualifier: 'Starter', after: '$15 per seat/month', status: 'sourced', url: 'https://www.hubspot.com/pricing/sales' },
    { entity: 'Pipedrive', aspect: 'price', qualifier: 'Essential', after: '$14 per seat/month', status: 'sourced', url: 'https://www.pipedrive.com/en/pricing' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plan, 'Starter');
  assert.equal(rows[1].entity, 'Pipedrive');
});

test('a product with no primary quote is named', () => {
  const gaps = missingPrimary(['HubSpot', 'Attio'], ['price'], [
    { entity: 'HubSpot', aspect: 'price', quote: 'Starter is $15 per seat/month', tier: 1, status: 'sourced' },
  ]);
  assert.deepEqual(gaps, [{ entity: 'Attio', aspect: 'price' }]);
});
