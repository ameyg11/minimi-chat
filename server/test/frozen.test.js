import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFrozen, runFrozen } from '../src/agent/frozen.js';

test('the frozen demo answers recall, an unchanged page, and a price change', () => {
  const fixture = loadFrozen(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/frozen.json'));
  const result = runFrozen(fixture);
  assert.deepEqual(result.asked, ['What does Neon charge for Launch compute?']);
  assert.equal(result.stillCorrect, true);
  assert.equal(result.changed, true);
  assert.equal(result.droppedUnsourced, true);
});
