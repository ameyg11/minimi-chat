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
  const list = [...new Set(urls.filter(Boolean))].slice(0, 20);
  if (!list.length) return { pages: [], failed: [] };
  const data = await tavily('extract', {
    urls: list,
    extract_depth: 'advanced',
  }, 40000);
  const pages = (data.results || []).map((result) => ({
    url: result.url,
    title: result.title || '',
    text: String(result.raw_content || result.content || '').slice(0, PAGE_CAP),
  })).filter((page) => page.url && page.text);
  const failed = (data.failed_results || []).map((result) => ({
    url: result.url,
    error: result.error || 'failed',
  }));
  const found = new Set(pages.map((page) => page.url));
  for (const url of list) {
    if (!found.has(url) && !failed.some((item) => item.url === url)) {
      failed.push({ url, error: 'empty page' });
    }
  }
  return { pages, failed };
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
