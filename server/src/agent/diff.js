import crypto from 'crypto';

export function normalizePage(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function hashText(text) {
  return crypto.createHash('sha256').update(normalizePage(text)).digest('hex');
}

export function unchangedByHash(previousHash, nextHash) {
  return Boolean(previousHash) && Boolean(nextHash) && previousHash === nextHash;
}

export function qualifierKey(qualifier) {
  return String(qualifier || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function slotKey(claim) {
  return [
    String(claim.entity || '').toLowerCase().trim(),
    claim.aspect || 'other',
    qualifierKey(claim.qualifier || ''),
  ].join('|');
}

export function parseMoney(claim) {
  const text = `${claim.display || ''} ${claim.value || ''} ${claim.unit || ''} ${claim.period || ''}`.toLowerCase();
  const match = text.match(/(?:\$|usd\s*|€|£|₹)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:usd|dollars|eur)/);
  const raw = match?.[1] || match?.[2];
  if (!raw) return null;
  const amount = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;

  let period = 'unspecified';
  if (['hour', 'year', 'month', 'once'].includes(claim.period)) period = claim.period;
  else if (/\b(hour|hr|cu-hour|\/h)\b/.test(text)) period = 'hour';
  else if (/\b(year|annual|annually|\/yr|per year)\b/.test(text)) period = 'year';
  else if (/\b(month|monthly|\/mo|per month)\b/.test(text)) period = 'month';
  else if (/\b(once|one-time|one time)\b/.test(text)) period = 'once';

  let basis = 'unspecified';
  if (/\b(seat|user|member|license)\b/.test(text)) basis = 'seat';
  else if (/\b(hour|gb|cu|usage|request)\b/.test(text)) basis = 'usage';
  else if (/\b(flat|workspace)\b/.test(text)) basis = 'flat';

  let currency = 'USD';
  if (text.includes('€') || text.includes('eur')) currency = 'EUR';
  else if (text.includes('£')) currency = 'GBP';
  else if (text.includes('₹') || text.includes('inr')) currency = 'INR';

  return { amount, period, basis, currency };
}

export function comparablePrice(left, right) {
  if (!left || !right) return { ok: false, reason: 'missing' };
  if (left.currency !== right.currency) return { ok: false, reason: 'currency' };
  if (left.period === 'unspecified' || right.period === 'unspecified') return { ok: false, reason: 'period' };
  const yearMonth = (left.period === 'year' && right.period === 'month')
    || (left.period === 'month' && right.period === 'year');
  if (left.period !== right.period && !yearMonth) return { ok: false, reason: 'period' };
  if (left.basis !== 'unspecified' && right.basis !== 'unspecified' && left.basis !== right.basis) {
    return { ok: false, reason: 'basis' };
  }
  if (left.period === 'hour' || right.period === 'hour' || left.period === 'once' || right.period === 'once') {
    if (left.period !== right.period) return { ok: false, reason: 'period' };
    return { ok: true, left: left.amount, right: right.amount };
  }
  const monthly = (price) => (price.period === 'year' ? price.amount / 12 : price.amount);
  return { ok: true, left: monthly(left), right: monthly(right) };
}

export function pricesDiffer(left, right) {
  const diff = Math.abs(left - right);
  const scale = Math.max(Math.abs(left), Math.abs(right), 0.01);
  return diff > 0.009 && diff / scale > 0.01;
}

export function diffClaims(previous, current) {
  const findings = [];
  const currentGroups = groupClaims(current);
  const used = new Set();

  for (const prev of previous) {
    const key = slotKey(prev);
    const group = (currentGroups.get(key) || []).filter((item) => !used.has(item));
    if (!group.length) {
      if (prev.aspect === 'launch') continue;
      findings.push(findingFrom(prev, null, 'unverifiable', 'I could not find this on the page I re-read.'));
      continue;
    }
    if (prev.aspect === 'price' && conflictingPrices(group)) {
      group.forEach((item) => used.add(item));
      findings.push({
        ...findingFrom(prev, null, 'conflict', 'Sources disagree, so I will not pick one.'),
        after: group.map((item) => item.claim.display).filter(Boolean).join(' vs '),
        citationIds: group.flatMap((item) => idsOf(item.claim)),
        persist: null,
      });
      continue;
    }
    const next = group[0].claim;
    used.add(group[0]);
    findings.push(comparePair(prev, next));
  }

  for (const [key, group] of currentGroups) {
    for (const item of group) {
      if (used.has(item)) continue;
      if (item.claim.aspect !== 'launch') continue;
      const status = item.claim.magnitude === 'major' ? 'changed' : 'not_big';
      const note = status === 'changed'
        ? 'New since the last check.'
        : 'Small release, not a big ship.';
      findings.push({
        ...findingFrom(null, item.claim, status, note),
        entity: item.claim.entity,
        aspect: 'launch',
        qualifier: item.claim.qualifier || '',
        slot: key,
      });
    }
  }

  return findings;
}

export function findingsFromUnchanged(claims, evidence) {
  const afterAt = evidence.fetchedAt;
  if (!claims.length) {
    return [{
      entity: evidence.domain || 'Saved page',
      aspect: 'other',
      qualifier: '',
      status: 'unchanged',
      before: null,
      after: null,
      beforeAt: null,
      afterAt,
      note: 'The page text matches the snapshot I saved.',
      citationIds: [String(evidence._id)],
      quote: '',
      tier: evidence.tier,
      url: evidence.url,
      persist: null,
    }];
  }
  return claims.map((claim) => ({
    entity: claim.entity,
    aspect: claim.aspect,
    qualifier: claim.qualifier || '',
    status: 'unchanged',
    before: claim.display,
    after: claim.display,
    beforeAt: claim.observedAt,
    afterAt,
    note: 'The page text matches the snapshot I saved.',
    citationIds: [String(claim.evidenceId), String(evidence._id)].filter(Boolean),
    quote: claim.quote || '',
    tier: evidence.tier ?? claim.tier,
    url: evidence.url,
    persist: cloneClaim(claim, evidence, afterAt),
  }));
}

export function collapseFindings(findings) {
  const rest = [];
  const groups = new Map();
  for (const finding of findings) {
    if (!finding.entity || finding.aspect === 'other') {
      rest.push(finding);
      continue;
    }
    const key = slotKey(finding);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  const merged = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const afters = [...new Set(group.map((item) => (item.after || '').toLowerCase()).filter(Boolean))];
    const conflicted = afters.length > 1 || group.some((item) => item.status === 'conflict');
    if (conflicted) {
      merged.push({
        ...group[0],
        status: 'conflict',
        after: afters.join(' vs '),
        note: 'Sources disagree, so I will not pick one.',
        persist: null,
        citationIds: [...new Set(group.flatMap((item) => item.citationIds || []))],
      });
      continue;
    }
    const rank = { unchanged: 0, changed: 1, sourced: 2, not_big: 3, not_comparable: 4, unverifiable: 5, conflict: 6 };
    group.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
    merged.push({
      ...group[0],
      citationIds: [...new Set(group.flatMap((item) => item.citationIds || []))],
    });
  }
  return [...merged, ...rest];
}

function comparePair(prev, next) {
  if (prev.aspect === 'price') {
    const compared = comparablePrice(parseMoney(prev), parseMoney(next));
    if (!compared.ok) {
      return findingFrom(prev, next, 'not_comparable', 'The two prices are not in the same terms.');
    }
    const status = pricesDiffer(compared.left, compared.right) ? 'changed' : 'unchanged';
    return findingFrom(prev, next, status, status === 'changed' ? 'The price moved.' : 'Same price.');
  }
  if (prev.aspect === 'launch') {
    const status = next.magnitude === 'minor' ? 'not_big' : 'unchanged';
    return findingFrom(prev, next, status, status === 'not_big' ? 'Small release, not a big ship.' : 'Already recorded.');
  }
  const same = normalizePage(prev.display).toLowerCase() === normalizePage(next.display).toLowerCase();
  return findingFrom(prev, next, same ? 'unchanged' : 'changed', same ? 'Same as before.' : 'The details changed.');
}

function findingFrom(prev, next, status, note) {
  const base = next || prev || {};
  return {
    entity: base.entity || '',
    aspect: base.aspect || 'other',
    qualifier: base.qualifier || '',
    status,
    before: prev?.display || null,
    after: next?.display || null,
    beforeAt: prev?.observedAt || null,
    afterAt: next?.observedAt || null,
    note,
    citationIds: [...new Set([...idsOf(prev), ...idsOf(next)])],
    quote: next?.quote || prev?.quote || '',
    tier: next?.tier ?? prev?.tier ?? null,
    url: next?.url || prev?.url || '',
    persist: next && status !== 'conflict' && status !== 'unverifiable' ? cloneClaim(next, { _id: next.evidenceId, url: next.url, tier: next.tier }, next.observedAt) : null,
  };
}

function cloneClaim(claim, evidence, observedAt) {
  return {
    entity: claim.entity,
    aspect: claim.aspect,
    qualifier: claim.qualifier || '',
    display: claim.display || '',
    value: claim.value || '',
    unit: claim.unit || '',
    period: claim.period || '',
    quote: claim.quote || '',
    evidenceId: evidence?._id || claim.evidenceId,
    url: evidence?.url || claim.url || '',
    observedAt: observedAt || claim.observedAt || new Date(),
    confidence: claim.confidence || 'medium',
    magnitude: claim.magnitude || 'none',
    tier: evidence?.tier ?? claim.tier ?? 4,
  };
}

function idsOf(claim) {
  if (!claim?.evidenceId) return [];
  return [String(claim.evidenceId)];
}

function groupClaims(claims) {
  const groups = new Map();
  for (const claim of claims) {
    const key = slotKey(claim);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ claim, key });
  }
  return groups;
}

function conflictingPrices(group) {
  if (group.length < 2) return false;
  const parsed = group.map((item) => parseMoney(item.claim)).filter(Boolean);
  if (parsed.length < 2) return false;
  for (let i = 1; i < parsed.length; i += 1) {
    const compared = comparablePrice(parsed[0], parsed[i]);
    if (compared.ok && pricesDiffer(compared.left, compared.right)) return true;
  }
  return false;
}
