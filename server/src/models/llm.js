import { config } from '../config.js';
import { AgentError } from '../errors.js';

export async function completeJson({ model, system, user, schema, name, effort = 'low', maxTokens = 2200 }) {
  try {
    return await callResponses({ model, system, user, schema, name, effort, maxTokens });
  } catch (err) {
    if (err.code === 'auth') throw err;
    return callChat({ model, system, user, schema, name, effort, maxTokens });
  }
}

async function callResponses({ model, system, user, schema, name, effort, maxTokens }) {
  const attempts = effort ? [effort, null] : [null];
  let last = null;
  for (const attempt of attempts) {
    const body = {
      model,
      instructions: system,
      input: user,
      max_output_tokens: maxTokens,
      text: {
        format: { type: 'json_schema', name, strict: true, schema },
      },
    };
    if (attempt) body.reasoning = { effort: attempt };
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
    const raw = await res.text();
    if (res.status === 401) throw new AgentError('OPENAI_API_KEY was rejected.', 'auth');
    if (!res.ok) {
      last = new AgentError(`The model call failed (${res.status}).`, 'model');
      last.detail = raw.slice(0, 400);
      if (res.status === 400) continue;
      throw last;
    }
    const data = JSON.parse(raw);
    const text = outputText(data);
    if (!text) throw new AgentError('The model returned nothing.', 'model');
    return parseJson(text);
  }
  throw last || new AgentError('The model call failed.', 'model');
}

async function callChat({ model, system, user, schema, name, effort, maxTokens }) {
  const attempts = effort ? [effort, null] : [null];
  let last = null;
  for (const attempt of attempts) {
    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name, strict: true, schema },
      },
      max_completion_tokens: maxTokens,
    };
    if (attempt) body.reasoning_effort = attempt;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
    const raw = await res.text();
    if (res.status === 401) throw new AgentError('OPENAI_API_KEY was rejected.', 'auth');
    if (!res.ok) {
      last = new AgentError(`The model call failed (${res.status}).`, 'model');
      last.detail = raw.slice(0, 400);
      if (res.status === 400) continue;
      throw last;
    }
    const data = JSON.parse(raw);
    const text = outputText(data);
    if (!text) throw new AgentError('The model returned nothing.', 'model');
    return parseJson(text);
  }
  throw last || new AgentError('The model call failed.', 'model');
}

function outputText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === 'string') chunks.push(part.text);
    }
  }
  if (chunks.length) return chunks.join('');
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text || '').join('');
  return '';
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AgentError('The model returned malformed JSON.', 'model');
  }
}
