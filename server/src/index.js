import express from 'express';
import cors from 'cors';
import { config, missingKeys } from './config.js';
import { connectDb } from './db.js';
import { runTurn } from './agent/run.js';
import {
  listConversations,
  getConversation,
  messagesFor,
  listFacts,
  presentConversation,
  presentMessage,
  isId,
} from './memory/store.js';

const missing = missingKeys();
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}. Set them in .env (see .env.example).`);
  process.exit(1);
}

await connectDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/conversations', async (_req, res) => {
  res.json({ conversations: await listConversations() });
});

app.get('/api/conversations/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Unknown conversation.' });
  const conversation = await getConversation(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Unknown conversation.' });
  const messages = await messagesFor(conversation._id);
  res.json({
    conversation: presentConversation(conversation),
    messages: messages.map(presentMessage),
  });
});

app.get('/api/facts', async (_req, res) => {
  res.json({ facts: await listFacts() });
});

app.post('/api/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is empty.' });
  if (message.length > 4000) return res.status(400).json({ error: 'Message is too long.' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runTurn({
      conversationId: req.body.conversationId || null,
      message,
      onStatus: (detail) => send('status', { detail }),
      onToken: (text) => send('token', { text }),
      onMeta: (meta) => send('meta', meta),
    });
    send('done', result);
  } catch (err) {
    console.error(err);
    send('error', { message: err.publicMessage || 'Something went wrong before I could answer.' });
  } finally {
    res.end();
  }
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
