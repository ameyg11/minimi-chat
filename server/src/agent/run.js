import { config } from '../config.js';
import { resolveDates } from '../memory/dates.js';
import { retrieveMemory } from '../memory/retrieve.js';
import {
  createConversation,
  getConversation,
  recentMessages,
  listFacts,
  saveMessage,
  saveClaims,
  touchConversation,
  applyFactUpdates,
  presentMessage,
  titleFrom,
} from '../memory/store.js';
import { planTurn } from './plan.js';
import { recheck, researchNew } from './research.js';
import { collapseFindings } from './diff.js';
import {
  composeAnswer,
  composeChat,
  recallProse,
  summarizeFindings,
  decideConfidence,
  buildCitations,
  numberFindings,
} from './answer.js';

const FETCH_FAIL = 'I couldn\'t re-read the source, so I can\'t say the earlier answer is still correct.';

export async function runTurn({ conversationId, message, onStatus, onToken, onMeta }) {
  const startedAt = new Date();
  let conversation = null;
  try {
    conversation = await ensureConversation(conversationId, message);
    onMeta?.({ conversationId: String(conversation._id), title: conversation.title });
    return await execute({ conversation, message, startedAt, onStatus, onToken });
  } catch (err) {
    console.error(err);
    const prose = err.publicMessage || 'Something went wrong before I could answer.';
    if (!conversation) return unsaved(message, prose, startedAt);
    return finish({
      conversation,
      message,
      startedAt,
      plan: { topic: '', entities: [], factUpdates: [] },
      prose,
      findings: [],
      citations: [],
      confidence: 'abstain',
      abstainReason: prose,
      trace: [],
      onToken,
    });
  }
}

async function execute({ conversation, message, startedAt, onStatus, onToken }) {
  const trace = [];
  const pushTrace = (stage, detail) => {
    trace.push({ stage, detail, at: new Date().toISOString() });
    onStatus?.(detail);
  };

  pushTrace('plan', 'Reading the question');
  const dates = resolveDates(message, startedAt, config.timezone);
  const [facts, thread] = await Promise.all([
    listFacts(),
    recentMessages(conversation._id, 8),
  ]);
  const plan = await planTurn({ message, dates, thread, facts });
  if (plan.warning) pushTrace('plan', plan.warning);
  pushTrace('plan', describePlan(plan));

  const types = new Set(plan.steps.map((step) => step.type));
  const memory = await retrieveMemory({
    plan,
    dates,
    conversationId: conversation._id,
    timeZone: config.timezone,
  });

  if (memory.ambiguous) {
    return finish({
      conversation,
      message,
      startedAt,
      plan,
      prose: clarificationText(memory.candidates),
      findings: [],
      citations: [],
      confidence: 'low',
      abstainReason: 'Which conversation should I use?',
      trace,
      onToken,
    });
  }

  const wantsPast = types.has('recall') || types.has('reverify') || types.has('delta');
  const researching = types.has('research');
  if (wantsPast && !memory.found && !researching) {
    const prose = missingMemoryText(dates);
    return finish({
      conversation,
      message,
      startedAt,
      plan,
      prose,
      findings: [],
      citations: [],
      confidence: 'abstain',
      abstainReason: prose,
      trace,
      onToken,
    });
  }

  let findings = [];
  let evidenceDocs = [];
  let fetchFailed = false;
  const checking = types.has('reverify') || types.has('delta');

  if (checking && memory.found) {
    const checked = await recheck({ memory, plan, pushTrace });
    findings = findings.concat(checked.findings);
    evidenceDocs = evidenceDocs.concat(checked.evidenceDocs);
    fetchFailed = checked.fetchFailed;
  }

  if (researching) {
    const fresh = await researchNew({ plan, memory, pushTrace });
    findings = findings.concat(fresh.findings);
    evidenceDocs = evidenceDocs.concat(fresh.evidenceDocs);
  }

  findings = collapseFindings(findings);
  const recall = types.has('recall') ? recallProse(memory.messages, config.timezone, dates.ranges[0]?.label) : '';
  const citations = buildCitations(findings, [...memory.evidence, ...evidenceDocs]);
  const numbered = numberFindings(findings, citations);

  let prose = '';
  let abstainReason = '';
  if (!checking && !researching && types.has('recall')) {
    prose = recall || missingMemoryText(dates);
    if (!recall) abstainReason = prose;
  } else if (!checking && !researching && (types.has('chat') || types.has('clarify'))) {
    prose = types.has('clarify') && plan.clarify
      ? plan.clarify
      : await composeChat({ message, facts });
  } else if (fetchFailed && !findings.some((item) => ['changed', 'unchanged', 'sourced', 'not_big'].includes(item.status))) {
    abstainReason = FETCH_FAIL;
    prose = [recall, FETCH_FAIL].filter(Boolean).join('\n\n');
  } else if (researching && !findings.length && !recall) {
    abstainReason = 'I couldn\'t find a primary source for that, so I don\'t have an answer.';
    prose = abstainReason;
  } else if (findings.length || recall) {
    const composed = await composeAnswer({
      message,
      findings,
      citations,
      facts,
      recall,
      timeZone: config.timezone,
    });
    const body = composed.prose || summarizeFindings(findings);
    prose = [recall, body].filter(Boolean).join('\n\n');
    if (!body && fetchFailed) abstainReason = FETCH_FAIL;
  } else {
    abstainReason = missingMemoryText(dates);
    prose = abstainReason;
  }

  const confidence = decideConfidence({
    findings,
    abstain: Boolean(abstainReason),
    fetchFailed,
  });

  return finish({
    conversation,
    message,
    startedAt,
    plan,
    prose,
    findings: numbered,
    citations,
    confidence,
    abstainReason,
    trace,
    onToken,
    persist: findings.map((item) => item.persist).filter(Boolean),
  });
}

async function finish({
  conversation,
  message,
  startedAt,
  plan,
  prose,
  findings,
  citations,
  confidence,
  abstainReason,
  trace,
  onToken,
  persist = [],
}) {
  const user = await saveMessage({
    conversationId: conversation._id,
    role: 'user',
    content: message,
    createdAt: startedAt,
    topic: plan.topic || '',
    entities: plan.entities || [],
  });
  const assistant = await saveMessage({
    conversationId: conversation._id,
    role: 'assistant',
    content: prose,
    createdAt: new Date(),
    topic: plan.topic || '',
    entities: plan.entities || [],
    findings,
    citations,
    confidence,
    abstainReason: abstainReason || '',
    trace,
  });
  if (persist.length) {
    await saveClaims(persist.map((claim) => ({
      ...claim,
      conversationId: conversation._id,
      messageId: assistant._id,
      observedAt: claim.observedAt || assistant.createdAt,
    })));
  }
  await applyFactUpdates(plan.factUpdates || [], assistant._id);
  await touchConversation(conversation._id);
  await emitProse(prose, onToken);
  const facts = await listFacts();
  return {
    conversationId: String(conversation._id),
    title: conversation.title,
    userMessage: presentMessage(user),
    message: presentMessage(assistant),
    facts,
  };
}

async function ensureConversation(conversationId, message) {
  if (conversationId) {
    const existing = await getConversation(conversationId);
    if (existing) return existing;
  }
  return createConversation(titleFrom(message));
}

function unsaved(message, prose, startedAt) {
  return {
    conversationId: null,
    title: titleFrom(message),
    userMessage: {
      id: `local-user-${startedAt.getTime()}`,
      role: 'user',
      content: message,
      createdAt: startedAt,
      findings: [],
      citations: [],
      confidence: '',
      trace: [],
    },
    message: {
      id: `local-assistant-${startedAt.getTime()}`,
      role: 'assistant',
      content: prose,
      createdAt: new Date(),
      findings: [],
      citations: [],
      confidence: 'abstain',
      abstainReason: prose,
      trace: [],
    },
    facts: [],
  };
}

async function emitProse(prose, onToken) {
  if (!onToken || !prose) return;
  const parts = String(prose).split(/(\s+)/);
  let buffer = '';
  for (const part of parts) {
    buffer += part;
    if (buffer.length >= 24) {
      onToken(buffer);
      buffer = '';
    }
  }
  if (buffer) onToken(buffer);
}

function describePlan(plan) {
  const names = plan.steps.map((step) => step.type);
  if (names.length === 1 && names[0] === 'chat') return 'No search. This is just conversation.';
  if (names.includes('recall') && names.includes('reverify')) return 'Recall that day, then check the saved pages.';
  if (names.includes('recall') && !names.includes('research')) return 'Looking up what you asked. No web search.';
  if (names.includes('delta')) return 'Compare the saved snapshot with the live page.';
  if (names.includes('reverify')) return 'Check whether the saved answer still holds.';
  if (names.includes('research')) return 'New question. A short web search, then stop.';
  return 'Working from what is already saved.';
}

function clarificationText(candidates) {
  const lines = candidates.map((candidate) => `${candidate.label} — ${candidate.preview}`);
  return `I found more than one conversation that fits.\n${lines.join('\n')}\nWhich one should I check?`;
}

function missingMemoryText(dates) {
  const label = dates.ranges[0]?.label;
  if (label) return `I don't have a conversation from ${label}.`;
  return 'I don\'t have that conversation saved, so I can\'t say what changed.';
}
