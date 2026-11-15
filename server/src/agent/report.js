import { parseMoney } from './diff.js';

export function teamSize(facts = [], texts = []) {
  const blobs = [
    ...facts.map((fact) => `${fact.key || ''} ${fact.value || ''}`),
    ...texts,
  ];
  for (const blob of blobs) {
    const match = String(blob || '').match(/\b(\d{1,5})\s*[- ]?(?:person|people|seat|member)s?\b/i);
    if (!match) continue;
    const size = Number(match[1]);
    if (size >= 1 && size <= 100000) return size;
  }
  return null;
}

export function withTeamTotals(findings, size) {
  if (!size) return findings;
  return findings.map((finding) => {
    if (finding.aspect !== 'price') return finding;
    const money = parseMoney({
      display: `${finding.after || ''} ${finding.qualifier || ''} ${finding.quote || ''}`,
      period: finding.period,
      unit: finding.unit,
    });
    if (!money || money.basis !== 'seat' || (money.period !== 'month' && money.period !== 'year')) return finding;
    const monthly = money.period === 'year' ? money.amount / 12 : money.amount;
    const total = Math.round(monthly * size * 100) / 100;
    const line = `${size} seats × ${moneyText(monthly)}/month = ${moneyText(total)}/month`;
    return {
      ...finding,
      teamSize: size,
      teamTotal: total,
      note: [finding.note, line].filter(Boolean).join(' '),
    };
  });
}

export function comparisonRows(findings) {
  const rows = findings.filter((finding) => (
    finding.aspect === 'price'
    && finding.after
    && ['sourced', 'unchanged', 'changed'].includes(finding.status)
  ));
  const entities = new Set(rows.map((row) => String(row.entity || '').toLowerCase()));
  if (entities.size < 2) return [];
  return rows.map((finding) => {
    const money = parseMoney({
      display: `${finding.after || ''} ${finding.qualifier || ''}`,
      period: finding.period,
    });
    return {
      entity: finding.entity,
      plan: finding.qualifier || '',
      price: finding.after,
      period: money?.period || '',
      basis: money?.basis || '',
      teamTotal: finding.teamTotal || null,
      teamSize: finding.teamSize || null,
      url: finding.url || '',
    };
  });
}

export function missingPrimary(entities, aspects, findings) {
  const wanted = (aspects || []).filter((aspect) => aspect === 'price' || aspect === 'launch');
  const check = wanted.length ? wanted : ['price'];
  const gaps = [];
  for (const entity of entities || []) {
    for (const aspect of check) {
      const found = findings.some((finding) => (
        String(finding.entity || '').toLowerCase() === String(entity).toLowerCase()
        && finding.aspect === aspect
        && finding.quote
        && (finding.tier ?? 4) <= 2
        && finding.status !== 'unverifiable'
      ));
      if (!found) gaps.push({ entity, aspect });
    }
  }
  return gaps;
}

export function gapFinding(gap) {
  return {
    entity: gap.entity,
    aspect: gap.aspect,
    qualifier: '',
    status: 'unverifiable',
    before: null,
    after: null,
    beforeAt: null,
    afterAt: null,
    note: `No primary quote for ${gap.entity} ${gap.aspect}.`,
    citationIds: [],
    quote: '',
    tier: null,
    url: '',
    persist: null,
  };
}

function moneyText(amount) {
  const rounded = Math.round(amount * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}
