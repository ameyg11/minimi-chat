import { formatWhen } from './dates.js';
import {
  messagesBetween,
  messagesFor,
  messagesSince,
  claimsForMessages,
  evidenceForClaims,
} from './store.js';

const STOP = new Set(`
  that this have what your with from then since them those asked about still
  correct today changed change pricing price priced prices shipped does been
  were was you are the and for any has have not now just last next week
  monday tuesday wednesday thursday friday saturday sunday yesterday
  something their there here into over after before
`.split(/\s+/).filter(Boolean));

export async function retrieveMemory({ plan, dates, conversationId, timeZone }) {
  const types = new Set(plan.steps.map((step) => step.type));
  const wantsPast = ['recall', 'reverify', 'delta'].some((type) => types.has(type));
  if (!wantsPast) return emptyMemory();

  const entities = collectEntities(plan);
  const tokens = topicTokens(`${plan.topic || ''} ${plan.steps.map((step) => (step.queries || []).join(' ')).join(' ')}`);
  const check = types.has('delta') || types.has('reverify');

  let chosen = [];
  if (dates.ranges.length) {
    const primary = await messagesBetween(dates.ranges.map((range) => ({ from: range.from, to: range.to })));
    const fallbackRanges = dates.ranges.map((range) => range.fallback).filter(Boolean);
    const fallback = fallbackRanges.length ? await messagesBetween(fallbackRanges) : [];
    if (primary.some((message) => message.role === 'user')) chosen = primary;
    else if (fallback.some((message) => message.role === 'user')) chosen = fallback;
  }

  if (!chosen.length && !dates.ranges.length && conversationId && (dates.followUp || dates.since || check || types.has('recall'))) {
    chosen = await messagesFor(conversationId);
  }

  if (!chosen.length && (check || dates.since)) {
    chosen = await messagesSince(new Date(Date.now() - 21 * 24 * 60 * 60 * 1000));
  }

  let groups = groupConversations(chosen);
  if (check) {
    groups = preferMatches(groups, entities, tokens);
    if (groups.length > 1) {
      return {
        ...emptyMemory(),
        ambiguous: true,
        candidates: groups.slice(0, 4).map((group) => summarize(group, timeZone)),
      };
    }
  }

  const messages = groups.flatMap((group) => group.messages);
  const assistantIds = messages.filter((message) => message.role === 'assistant').map((message) => message._id);
  const claims = await claimsForMessages(assistantIds);
  const evidence = await evidenceForClaims(claims);
  return {
    found: messages.some((message) => message.role === 'user'),
    ambiguous: false,
    candidates: [],
    messages,
    claims,
    evidence,
  };
}

function emptyMemory() {
  return { found: false, ambiguous: false, candidates: [], messages: [], claims: [], evidence: [] };
}

function groupConversations(messages) {
  const map = new Map();
  for (const message of messages) {
    const key = String(message.conversationId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(message);
  }
  return [...map.values()].map((rows) => ({ messages: rows }));
}

function preferMatches(groups, entities, tokens) {
  if (groups.length <= 1) return groups;
  const scored = groups.map((group) => ({ ...group, score: scoreGroup(group.messages, entities, tokens) }));
  const best = Math.max(...scored.map((group) => group.score));
  if (best <= 0) return scored;
  return scored.filter((group) => group.score === best);
}

function scoreGroup(messages, entities, tokens) {
  const blob = messages.map((message) => `${message.content} ${message.topic || ''} ${(message.entities || []).join(' ')}`).join('\n').toLowerCase();
  let score = 0;
  for (const entity of entities) {
    if (entity && blob.includes(entity.toLowerCase())) score += 3;
  }
  for (const token of tokens) {
    if (blob.includes(token)) score += 1;
  }
  return score;
}

function summarize(group, timeZone) {
  const firstUser = group.messages.find((message) => message.role === 'user') || group.messages[0];
  return {
    conversationId: String(firstUser.conversationId),
    createdAt: firstUser.createdAt,
    preview: String(firstUser.content || '').replace(/\s+/g, ' ').trim().slice(0, 110),
    label: formatWhen(firstUser.createdAt, timeZone),
  };
}

function collectEntities(plan) {
  return [...new Set([
    ...(plan.entities || []),
    ...plan.steps.flatMap((step) => step.entities || []),
  ].map((entity) => String(entity || '').trim()).filter((entity) => entity.length > 1))];
}

function topicTokens(text) {
  return [...new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !STOP.has(token)))];
}
