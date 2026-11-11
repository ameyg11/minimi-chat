import { connectDb } from '../db.js';
import { config } from '../config.js';
import { Conversation, Message, Claim, Evidence } from '../memory/schemas.js';
import { hashText } from '../agent/diff.js';
import { zonedDateTimeToUtc } from '../memory/dates.js';

const title = '[fixture] 3 November Postgres';
const quote = 'Practice snapshot only: Neon Launch compute is listed at $0.106 per CU-hour.';
const excerpt = `${quote} This sentence is fixture data so a later check has an old snapshot to compare. It is not a live reading of the pricing page.`;

await connectDb();

const existing = await Conversation.findOne({ title });
if (existing) {
  console.log('Fixture already exists. Nothing inserted.');
  process.exit(0);
}

const when = zonedDateTimeToUtc(2026, 11, 3, 10, 30, 0, config.timezone);
const conversation = await Conversation.create({
  title,
  createdAt: when,
  updatedAt: when,
});

const evidence = await Evidence.create({
  url: 'https://neon.tech/pricing',
  title: 'Neon pricing (fixture snapshot)',
  domain: 'neon.tech',
  tier: 1,
  tierLabel: 'Primary',
  quote,
  contentHash: hashText(excerpt),
  excerpt,
  extractDepth: 'advanced',
  fetchedAt: when,
  ok: true,
});

const user = await Message.create({
  conversationId: conversation._id,
  role: 'user',
  content: 'What should I look at for hosted Postgres for a side project? I keep hearing about Neon.',
  createdAt: when,
  topic: 'hosted Postgres',
  entities: ['Neon'],
});

const assistantAt = new Date(when.getTime() + 60 * 1000);
const assistant = await Message.create({
  conversationId: conversation._id,
  role: 'assistant',
  content: 'You asked about Neon for a side project. I saved a practice snapshot, not a live price: Launch compute is listed at $0.106 per CU-hour. Ask whether that is still correct and I will re-read the pricing page.',
  createdAt: assistantAt,
  topic: 'hosted Postgres',
  entities: ['Neon'],
  findings: [],
  citations: [{
    id: String(evidence._id),
    n: 1,
    url: evidence.url,
    title: evidence.title,
    domain: evidence.domain,
    quote,
    fetchedAt: when,
    tier: 1,
    tierLabel: 'Primary',
  }],
  confidence: 'medium',
  trace: [{ stage: 'seed', detail: 'Fixture snapshot, not a live fetch.', at: when.toISOString() }],
});

await Claim.create({
  conversationId: conversation._id,
  messageId: assistant._id,
  entity: 'Neon',
  aspect: 'price',
  qualifier: 'launch compute',
  display: '$0.106 per CU-hour',
  value: '0.106',
  unit: 'usd_per_cu_hour',
  period: 'hour',
  quote,
  evidenceId: evidence._id,
  url: evidence.url,
  observedAt: when,
  confidence: 'low',
  magnitude: 'none',
  tier: 1,
});

console.log(`Inserted fixture conversation ${conversation._id} and user message ${user._id}.`);
console.log('The $0.106 figure is practice data. A re-check compares it with the live page.');
process.exit(0);
