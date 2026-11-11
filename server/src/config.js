import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

function env(name) {
  return (process.env[name] || '').trim();
}

export const config = {
  geminiKey: env('GEMINI_API_KEY'),
  tavilyKey: env('TAVILY_API_KEY'),
  mongoUri: env('MONGODB_URI'),
  fastModel: env('LLM_FAST_MODEL') || 'gemini-3.5-flash',
  answerModel: env('LLM_ANSWER_MODEL') || 'gemini-3.5-flash',
  timezone: env('USER_TIMEZONE') || 'Asia/Kolkata',
  port: Number(env('PORT') || 3001),
};

export function missingKeys() {
  const missing = [];
  if (!config.geminiKey) missing.push('GEMINI_API_KEY');
  if (!config.tavilyKey) missing.push('TAVILY_API_KEY');
  if (!config.mongoUri) missing.push('MONGODB_URI');
  return missing;
}
