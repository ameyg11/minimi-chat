import path from 'path';
import { fileURLToPath } from 'url';
import { loadFrozen, runFrozen } from '../agent/frozen.js';

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/frozen.json');
const result = runFrozen(loadFrozen(fixturePath));
const lines = [
  `1. What did I ask on 3 November? ${result.asked[0] || 'Nothing saved that day.'}`,
  `2. Is it still correct? ${result.stillCorrect ? 'Yes. The saved page hash matches.' : 'No. The saved page hash differs.'}`,
  `3. Has the price changed? ${result.changed ? `Yes. ${result.before} → ${result.after}.` : 'No change in the frozen snapshot.'}`,
  `Unsourced price dropped: ${result.droppedUnsourced ? 'yes' : 'no'}`,
];
console.log(lines.join('\n'));
if (!result.asked.length || !result.stillCorrect || !result.changed || !result.droppedUnsourced) {
  process.exit(1);
}
