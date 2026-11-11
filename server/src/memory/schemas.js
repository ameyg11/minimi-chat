import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  title: { type: String, default: 'New chat' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  topic: { type: String, default: '' },
  entities: { type: [String], default: [] },
  findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
  citations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  confidence: { type: String, default: '' },
  abstainReason: { type: String, default: '' },
  trace: { type: [mongoose.Schema.Types.Mixed], default: [] },
});

messageSchema.index({ entities: 1, createdAt: -1 });
messageSchema.index({ content: 'text', topic: 'text' });

const claimSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, index: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, index: true },
  entity: { type: String, required: true },
  aspect: { type: String, enum: ['price', 'launch', 'feature', 'other'], default: 'other' },
  qualifier: { type: String, default: '' },
  display: { type: String, default: '' },
  value: { type: String, default: '' },
  unit: { type: String, default: '' },
  period: { type: String, default: '' },
  quote: { type: String, default: '' },
  evidenceId: { type: mongoose.Schema.Types.ObjectId, index: true },
  url: { type: String, default: '' },
  observedAt: { type: Date, default: Date.now, index: true },
  confidence: { type: String, default: 'medium' },
  magnitude: { type: String, default: 'none' },
  tier: { type: Number, default: 4 },
});

claimSchema.index({ entity: 1, observedAt: -1 });

const evidenceSchema = new mongoose.Schema({
  url: { type: String, required: true },
  title: { type: String, default: '' },
  domain: { type: String, default: '' },
  tier: { type: Number, default: 4 },
  tierLabel: { type: String, default: 'Other' },
  quote: { type: String, default: '' },
  contentHash: { type: String, default: '' },
  excerpt: { type: String, default: '' },
  extractDepth: { type: String, default: 'advanced' },
  fetchedAt: { type: Date, default: Date.now },
  ok: { type: Boolean, default: true },
  error: { type: String, default: '' },
});

evidenceSchema.index({ url: 1, fetchedAt: -1 });

const factSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  sourceMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
export const Claim = mongoose.model('Claim', claimSchema);
export const Evidence = mongoose.model('Evidence', evidenceSchema);
export const Fact = mongoose.model('Fact', factSchema);

export function isId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}
