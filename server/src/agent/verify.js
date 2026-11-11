import { parseMoney } from './diff.js';

const MONEY_RE = /(?:\$|₹|€|£)\s?\d[\d,]*(?:\.\d+)?/g;

export function verifyClaims(claims, evidenceById) {
  const kept = [];
  const dropped = [];
  for (const claim of claims) {
    const evidence = evidenceById.get(String(claim.evidenceId));
    const quote = String(claim.quote || '').trim();
    if (!quote || !evidence) {
      dropped.push({ claim, reason: 'no quote' });
      continue;
    }
    const hay = `${evidence.excerpt || ''}\n${evidence.quote || ''}`;
    if (!excerptContains(hay, quote)) {
      dropped.push({ claim, reason: 'quote not on page' });
      continue;
    }
    const tier = evidence.tier ?? claim.tier ?? 5;
    if (claim.aspect === 'price' && tier >= 4) {
      dropped.push({ claim, reason: 'price needs a primary or press source' });
      continue;
    }
    if (claim.aspect === 'price' && !quoteSupportsPrice(quote, claim)) {
      dropped.push({ claim, reason: 'number not in quote' });
      continue;
    }
    kept.push({ ...claim, tier, quote });
  }
  return { kept, dropped };
}

export function excerptContains(excerpt, quote) {
  const hay = norm(excerpt);
  const needle = norm(quote);
  if (needle.length < 8) return false;
  if (hay.includes(needle)) return true;
  const parts = needle.split(/\s*(?:\.\.\.|…)\s*/).map((part) => part.trim()).filter((part) => part.length >= 8);
  return parts.length > 1 && parts.every((part) => hay.includes(part));
}

export function quoteSupportsPrice(quote, claim) {
  const money = parseMoney({ ...claim, display: claim.display || claim.value || '' });
  if (!money) return false;
  return moneyPresent(norm(quote).replace(/,/g, ''), money.amount);
}

export function scrubUnsourcedMoney(prose, quotes) {
  const hay = quotes.map((quote) => norm(quote)).join('\n').replace(/,/g, '');
  const sentences = String(prose || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = [];
  let dropped = 0;
  for (const sentence of sentences) {
    const monies = sentence.match(MONEY_RE) || [];
    const bad = monies.some((token) => {
      const amount = Number(token.replace(/[^0-9.]/g, ''));
      return Number.isFinite(amount) && !moneyPresent(hay, amount);
    });
    if (bad) dropped += 1;
    else kept.push(sentence);
  }
  return { prose: kept.join(' ').trim(), dropped };
}

function moneyPresent(hay, amount) {
  if (!Number.isFinite(amount)) return false;
  const forms = new Set([String(amount), amount.toFixed(2), amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')]);
  for (const form of forms) {
    const pattern = new RegExp(`(?<!\\d)${form.replace('.', '\\.')}(?!\\d)`);
    if (pattern.test(hay)) return true;
  }
  return false;
}

function norm(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
