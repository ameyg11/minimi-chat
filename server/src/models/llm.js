import { config } from '../config.js';
import { AgentError } from '../errors.js';

export async function completeJson({ model, system, user, schema, maxTokens = 2200 }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': config.geminiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: geminiSchema(schema),
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(55000),
    },
  );
  const raw = await res.text();
  if (res.status === 401 || res.status === 403 || keyRejected(res.status, raw)) {
    throw new AgentError('GEMINI_API_KEY was rejected.', 'auth');
  }
  if (res.status === 429) {
    throw new AgentError('Gemini is rate-limiting requests. Wait a moment and try again.', 'quota');
  }
  if (!res.ok) {
    const err = new AgentError(`The model call failed (${res.status}).`, 'model');
    err.detail = raw.slice(0, 400);
    throw err;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AgentError('The model returned an unreadable response.', 'model');
  }
  const finish = data?.candidates?.[0]?.finishReason;
  if (finish === 'SAFETY' || finish === 'RECITATION' || data?.promptFeedback?.blockReason) {
    throw new AgentError('Gemini blocked that request.', 'model');
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim();
  if (!text) throw new AgentError('The model returned an empty response.', 'model');
  try {
    return JSON.parse(stripFence(text));
  } catch {
    const err = new AgentError('The model did not return JSON.', 'model');
    err.detail = text.slice(0, 400);
    throw err;
  }
}

function geminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const next = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue;
    next[key] = geminiSchema(value);
  }
  return next;
}

function keyRejected(status, raw) {
  if (status !== 400) return false;
  return /API key not valid|API_KEY_INVALID|permission denied/i.test(raw);
}

function stripFence(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
