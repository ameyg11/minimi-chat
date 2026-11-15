import { config } from '../config.js';
import { AgentError } from '../errors.js';
import { domainOf } from './rank.js';

const PAGE_CAP = 16000;

export async function searchWeb({ query, includeDomains, maxResults = 5 }) {
  const body = {
    query,
    search_depth: 'basic',
    max_results: maxResults,
    include_answer: false,
    include_raw_content: false,
  };
  if (includeDomains?.length) body.include_domains = includeDomains;
  const data = await tavily('search', body, 20000);
  return (data.results || []).map((result) => ({
    url: result.url,
    title: result.title || domainOf(result.url),
    snippet: result.content || '',
    score: result.score || 0,
  })).filter((result) => result.url);
}

export async function extractPages(urls) {
  const list = [...new Set(urls.filter(Boolean))].slice(0, 8);
  if (!list.length) return { pages: [], failed: [], retried: false };
  const first = await extractOnce(list);
  const thin = list.filter((url) => textOf(first, url).length < 400);
  let second = [];
  if (thin.length) {
    try {
      second = (await extractOnce(thin)).pages;
    } catch (err) {
      if (err.code === 'auth' || err.code === 'quota') throw err;
    }
  }
  const stillThin = thin.filter((url) => Math.max(textOf(first, url).length, textOf({ pages: second }, url).length) < 400);
  const direct = stillThin.length ? await directFetch(stillThin) : [];
  const pages = [];
  const failed = [];
  for (const url of list) {
    const candidates = [first.pages, second, direct]
      .flatMap((set) => set.filter((page) => page.url === url));
    const page = candidates.sort((a, b) => b.text.length - a.text.length)[0];
    if (page && page.text.length >= 80) pages.push(page);
    else failed.push({ url, error: 'empty page' });
  }
  return { pages, failed, retried: thin.length > 0 };
}

async function extractOnce(urls) {
  const data = await tavily('extract', { urls, extract_depth: 'advanced' }, 40000);
  const pages = (data.results || []).map((result) => ({
    url: result.url,
    title: result.title || '',
    text: String(result.raw_content || result.content || '').slice(0, PAGE_CAP),
  })).filter((page) => page.url && page.text);
  return { pages };
}

async function directFetch(urls) {
  const pages = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,text/plain',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const type = res.headers.get('content-type') || '';
      if (type && !/html|text\/plain/.test(type)) continue;
      const text = htmlToText(await res.text()).slice(0, PAGE_CAP);
      if (text.length >= 80) pages.push({ url, title: '', text });
    } catch {
      continue;
    }
  }
  return pages;
}

function textOf(result, url) {
  return result.pages.find((page) => page.url === url)?.text || '';
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function tavily(path, body, timeout) {
  let res;
  try {
    res = await fetch(`https://api.tavily.com/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.tavilyKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    throw new AgentError(`The web ${path} failed (${err.name === 'TimeoutError' ? 'timed out' : 'network'}).`, 'search');
  }
  if (res.status === 401 || res.status === 403) {
    throw new AgentError('TAVILY_API_KEY was rejected.', 'auth');
  }
  if (!res.ok) {
    const detail = await res.text();
    const error = new AgentError(`The web ${path} failed (${res.status}).`, 'search');
    error.detail = detail.slice(0, 300);
    throw error;
  }
  return res.json();
}
