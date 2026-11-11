import { config } from '../config.js';
import { completeJson } from '../models/llm.js';
import { formatWhen } from '../memory/dates.js';
import { entitiesInText } from '../search/rank.js';

const STEP_TYPES = ['recall', 'reverify', 'delta', 'research', 'chat', 'clarify'];
const ASPECTS = ['price', 'launch', 'feature', 'other'];

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string' },
    entities: { type: 'array', items: { type: 'string' } },
    clarify: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: STEP_TYPES },
          aspects: { type: 'array', items: { type: 'string', enum: ASPECTS } },
          entities: { type: 'array', items: { type: 'string' } },
          queries: { type: 'array', items: { type: 'string' } },
          useDate: { type: 'boolean' },
          since: { type: 'boolean' },
        },
        required: ['type', 'aspects', 'entities', 'queries', 'useDate', 'since'],
      },
    },
    factUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: ['set', 'delete'] },
          key: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['op', 'key', 'value'],
      },
    },
  },
  required: ['topic', 'entities', 'clarify', 'steps', 'factUpdates'],
};

const PLAN_SYSTEM = `You plan one turn for a memory-first assistant. The calendar is already resolved. Do not invent dates.
Pick the smallest step list:
- chat: greeting, thanks, or a reaction. No facts to look up.
- recall: they ask what they asked or what was said.
- reverify: they ask whether a past answer is still correct.
- delta: they ask what changed since a past conversation, especially price or a launch.
- research: a new factual question that needs the web.
- clarify: only when the wording cannot be answered even after memory is searched.
A question can be recall and then reverify. "What did I ask on that day, and is it still correct?" is both.
Do not add research to a pure memory question.
entities are product or company names, short, canonical. queries are search queries, empty unless the step is research or delta.
If they reveal a durable preference (team size, role, budget, a tool they use), add up to two factUpdates with op set. If they correct or retract one, set or delete it. Never store a question, a price, or a one-off task as a fact.
clarify is empty unless the step list contains clarify.`;

export async function planTurn({ message, dates, thread, facts }) {
  try {
    const planned = await completeJson({
      model: config.fastModel,
      system: PLAN_SYSTEM,
      user: JSON.stringify({
        message,
        dates: {
          ranges: dates.ranges.map((range) => ({
            label: range.label,
            fallback: range.fallback?.label || null,
          })),
          since: dates.since,
          followUp: dates.followUp,
        },
        thread: thread.slice(-6).map((item) => ({
          role: item.role,
          at: formatWhen(item.createdAt, dates.timeZone),
          content: String(item.content || '').slice(0, 400),
          entities: item.entities || [],
        })),
        facts,
      }),
      schema: PLAN_SCHEMA,
      name: 'turn_plan',
      effort: 'low',
      maxTokens: 1200,
    });
    return normalizePlan(ensureSteps(planned, message, dates));
  } catch (err) {
    if (err.code === 'auth' || err.code === 'quota') throw err;
    const planned = fallbackPlan(message, dates);
    planned.warning = 'Used the local planner.';
    return planned;
  }
}

export function ensureSteps(plan, message, dates) {
  const text = message.toLowerCase();
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)\b/.test(text) && text.length < 40) {
    return { ...plan, steps: [blankStep('chat')] };
  }
  let steps = (plan.steps || []).filter((step) => STEP_TYPES.includes(step.type)).slice(0, 3);
  if (wantsRecall(text) && !steps.some((step) => step.type === 'recall')) {
    steps.unshift(blankStep('recall'));
  }
  if (wantsReverify(text) && !steps.some((step) => step.type === 'reverify' || step.type === 'delta')) {
    steps.push(blankStep('reverify', ['price', 'feature']));
  } else if (!wantsReverify(text) && wantsDelta(text, dates) && !steps.some((step) => step.type === 'delta' || step.type === 'reverify')) {
    steps.push(blankStep('delta', aspectsFromText(text)));
  }
  if (wantsRecall(text) || wantsReverify(text) || wantsDelta(text, dates)) {
    steps = steps.filter((step) => step.type !== 'research');
  }
  if (!steps.length) steps = [fallbackStep(message)];
  if (steps.some((step) => step.type !== 'chat')) steps = steps.filter((step) => step.type !== 'chat');
  return { ...plan, steps: steps.slice(0, 3) };
}

export function fallbackPlan(message, dates) {
  const text = message.toLowerCase().trim();
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|cool)\b/.test(text) && text.length < 40) {
    return normalizePlan({
      topic: 'chat',
      entities: [],
      clarify: '',
      steps: [blankStep('chat')],
      factUpdates: [],
    });
  }
  const steps = [];
  if (wantsRecall(text)) steps.push(blankStep('recall'));
  if (wantsReverify(text)) steps.push(blankStep('reverify', ['price', 'feature']));
  else if (wantsDelta(text, dates)) steps.push(blankStep('delta', aspectsFromText(text)));
  if (!steps.length) steps.push(researchStep(message));
  const entities = entitiesInText(message).slice(0, 5);
  return normalizePlan({
    topic: entities.join(', ') || message.slice(0, 80),
    entities,
    clarify: '',
    steps,
    factUpdates: [],
  });
}

export function planEntities(plan) {
  return [...new Set([
    ...(plan.entities || []),
    ...plan.steps.flatMap((step) => step.entities || []),
  ].map((entity) => String(entity || '').trim()).filter((entity) => entity.length > 1))].slice(0, 5);
}

export function planAspects(plan) {
  const aspects = plan.steps.flatMap((step) => step.aspects || []);
  const unique = [...new Set(aspects.filter((aspect) => ASPECTS.includes(aspect)))];
  return unique.length ? unique : ['price'];
}

function normalizePlan(plan) {
  const steps = (plan.steps || []).slice(0, 3).map((step) => ({
    type: STEP_TYPES.includes(step.type) ? step.type : 'research',
    aspects: (step.aspects || []).filter((aspect) => ASPECTS.includes(aspect)).slice(0, 4),
    entities: (step.entities || []).map((entity) => String(entity).trim()).filter(Boolean).slice(0, 5),
    queries: (step.queries || []).map((query) => String(query).trim()).filter(Boolean).slice(0, 3),
    useDate: Boolean(step.useDate),
    since: Boolean(step.since),
  }));
  return {
    topic: String(plan.topic || '').slice(0, 120),
    entities: (plan.entities || []).map((entity) => String(entity).trim()).filter(Boolean).slice(0, 8),
    clarify: String(plan.clarify || '').slice(0, 400),
    steps,
    factUpdates: (plan.factUpdates || []).slice(0, 4).map((update) => ({
      op: update.op === 'delete' ? 'delete' : 'set',
      key: String(update.key || '').slice(0, 40),
      value: String(update.value || '').slice(0, 140),
    })).filter((update) => update.key),
    warning: plan.warning || '',
  };
}

function blankStep(type, aspects = []) {
  return { type, aspects, entities: [], queries: [], useDate: type !== 'chat' && type !== 'research', since: type === 'delta' || type === 'reverify' };
}

function researchStep(message) {
  const entities = entitiesInText(message).slice(0, 5);
  const aspects = aspectsFromText(message.toLowerCase());
  const word = aspects.includes('price') ? 'pricing' : 'docs';
  return {
    ...blankStep('research', aspects),
    entities,
    queries: entities.length ? entities.map((entity) => `${entity} official ${word}`) : [message.slice(0, 180)],
    useDate: false,
    since: false,
  };
}

function fallbackStep(message) {
  return researchStep(message);
}

function wantsRecall(text) {
  return /what did i ask|what did we (talk|discuss)|remind me what|what were we talking/.test(text);
}

function wantsReverify(text) {
  return /still correct|still true|still right|still accurate|does that still|is that still/.test(text);
}

function wantsDelta(text, dates) {
  const asks = /changed|change since|shipped|any of them/.test(text);
  const anchored = dates.ranges.length > 0 || dates.since || /monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|last /.test(text);
  return asks && anchored;
}

function aspectsFromText(text) {
  const aspects = [];
  if (/pric/.test(text)) aspects.push('price');
  if (/shipped|launch|release/.test(text)) aspects.push('launch');
  return aspects.length ? aspects : ['price', 'launch'];
}
