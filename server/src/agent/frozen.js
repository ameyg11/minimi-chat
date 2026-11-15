import { readFileSync } from 'fs';
import { resolveDates } from '../memory/dates.js';
import { hashText, unchangedByHash, diffClaims } from './diff.js';
import { verifyClaims } from './verify.js';

export function loadFrozen(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function runFrozen(fixture) {
  const now = new Date(fixture.now);
  const dates = resolveDates(fixture.questions.recall, now, 'Asia/Kolkata');
  const range = dates.ranges[0];
  const asked = fixture.messages.filter((message) => {
    const at = new Date(message.createdAt).getTime();
    return range && at >= new Date(range.from).getTime() && at < new Date(range.to).getTime() && message.role === 'user';
  }).map((message) => message.content);
  const stillCorrect = unchangedByHash(hashText(fixture.pageBefore), hashText(fixture.pageSame));
  const changed = diffClaims([fixture.claim], [fixture.claimAfter]);
  const verified = verifyClaims(
    [fixture.badClaim],
    new Map([[String(fixture.badClaim.evidenceId), { excerpt: fixture.pageBefore, tier: 1 }]]),
  );
  return {
    asked,
    stillCorrect,
    changed: changed[0]?.status === 'changed',
    before: fixture.claim.display,
    after: fixture.claimAfter.display,
    droppedUnsourced: verified.kept.length === 0,
  };
}
