import { Conversation, Message, Claim, Evidence, Fact, isId } from './schemas.js';

export { isId };

export function titleFrom(message) {
  const clean = String(message || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 72) return clean || 'New chat';
  const cut = clean.slice(0, 71);
  const word = cut.replace(/\s+\S*$/, '');
  return `${word || cut}…`;
}

export async function createConversation(title) {
  const now = new Date();
  const doc = await Conversation.create({ title, createdAt: now, updatedAt: now });
  return doc.toObject();
}

export async function touchConversation(id) {
  await Conversation.updateOne({ _id: id }, { updatedAt: new Date() });
}

export async function listConversations() {
  const rows = await Conversation.find().sort({ updatedAt: -1 }).lean();
  return rows.map(presentConversation);
}

export async function getConversation(id) {
  if (!isId(id)) return null;
  return Conversation.findById(id).lean();
}

export async function messagesFor(conversationId) {
  return Message.find({ conversationId }).sort({ createdAt: 1 }).lean();
}

export async function recentMessages(conversationId, limit = 8) {
  if (!conversationId || !isId(conversationId)) return [];
  const rows = await Message.find({ conversationId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.reverse();
}

export async function messagesBetween(ranges) {
  if (!ranges.length) return [];
  return Message.find({
    $or: ranges.map((range) => ({ createdAt: { $gte: range.from, $lt: range.to } })),
  }).sort({ createdAt: 1 }).limit(400).lean();
}

export async function messagesSince(date) {
  return Message.find({ createdAt: { $gte: date } }).sort({ createdAt: 1 }).limit(300).lean();
}

export async function saveMessage(doc) {
  const saved = await Message.create(doc);
  return saved.toObject();
}

export async function claimsForMessages(messageIds) {
  if (!messageIds.length) return [];
  return Claim.find({ messageId: { $in: messageIds } }).sort({ observedAt: 1 }).lean();
}

export async function evidenceForClaims(claims) {
  const ids = claims.map((claim) => claim.evidenceId).filter(Boolean);
  const direct = ids.length ? await Evidence.find({ _id: { $in: ids } }).lean() : [];
  const urls = [...new Set(direct.map((item) => item.url).concat(claims.map((claim) => claim.url)).filter(Boolean))];
  const history = urls.length
    ? await Evidence.find({ url: { $in: urls } }).sort({ fetchedAt: -1 }).lean()
    : [];
  const map = new Map();
  for (const item of [...direct, ...history]) map.set(String(item._id), item);
  return [...map.values()];
}

export async function saveEvidence(doc) {
  const saved = await Evidence.create(doc);
  return saved.toObject();
}

export async function stampEvidence(id, quote) {
  if (!id || !quote) return;
  await Evidence.updateOne({ _id: id }, { $set: { quote: String(quote).slice(0, 500) } });
}

export async function listTimeline() {
  const claims = await Claim.find().sort({ observedAt: -1 }).limit(80).lean();
  const evidence = await evidenceForClaims(claims);
  const byId = new Map(evidence.map((item) => [String(item._id), item]));
  const grouped = new Map();
  for (const claim of claims) {
    if (!grouped.has(claim.entity)) grouped.set(claim.entity, []);
    grouped.get(claim.entity).push(claim);
  }
  return [...grouped.entries()].slice(0, 8).map(([entity, rows]) => {
    const ordered = [...rows].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    let previous = '';
    const events = ordered.slice(-4).map((claim) => {
      const snapshot = byId.get(String(claim.evidenceId));
      const hash = snapshot?.contentHash || '';
      const sameHash = Boolean(previous) && Boolean(hash) && previous === hash;
      if (hash) previous = hash;
      return {
        at: claim.observedAt,
        display: claim.display || '',
        quote: claim.quote || '',
        url: claim.url || snapshot?.url || '',
        aspect: claim.aspect,
        sameHash,
      };
    });
    return { entity, events };
  });
}

export async function saveClaims(docs) {
  if (!docs.length) return [];
  const saved = await Claim.insertMany(docs);
  return saved.map((doc) => doc.toObject());
}

export async function listFacts() {
  const rows = await Fact.find().sort({ updatedAt: -1 }).lean();
  return rows.map((row) => ({
    id: String(row._id),
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt,
  }));
}

export async function applyFactUpdates(updates, messageId) {
  for (const update of (updates || []).slice(0, 4)) {
    const key = String(update.key || '').trim().slice(0, 40);
    const value = String(update.value || '').trim().slice(0, 140);
    if (!key) continue;
    if (update.op === 'delete') {
      await Fact.deleteOne({ key });
      continue;
    }
    if (!value) continue;
    await Fact.findOneAndUpdate(
      { key },
      { key, value, sourceMessageId: messageId || null, updatedAt: new Date() },
      { upsert: true },
    );
  }
  const all = await Fact.find().sort({ updatedAt: -1 }).lean();
  if (all.length > 20) {
    await Fact.deleteMany({ _id: { $in: all.slice(20).map((row) => row._id) } });
  }
}

export function presentConversation(row) {
  return {
    id: String(row._id),
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function presentMessage(row) {
  return {
    id: String(row._id),
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
    findings: row.findings || [],
    citations: row.citations || [],
    confidence: row.confidence || '',
    abstainReason: row.abstainReason || '',
    comparison: row.comparison || [],
    missingNote: row.missingNote || '',
    trace: row.trace || [],
    topic: row.topic || '',
    entities: row.entities || [],
  };
}
