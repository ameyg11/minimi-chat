const PRESS = new Set([
  'techcrunch.com',
  'theverge.com',
  'reuters.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'arstechnica.com',
  'wired.com',
  'ft.com',
  'economist.com',
  'theinformation.com',
  'cnbc.com',
]);

const WEAK_HOSTS = [
  'reddit.com',
  'medium.com',
  'quora.com',
  'stackoverflow.com',
  'news.ycombinator.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'instagram.com',
  'pinterest.com',
  'substack.com',
];

const PRIMARY_PATH = /pricing|plans|docs|documentation|changelog|releases|release-notes/i;

const DISPLAY_NAMES = {
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  pipedrive: 'Pipedrive',
  close: 'Close',
  copper: 'Copper',
  zoho: 'Zoho',
  freshsales: 'Freshsales',
  attio: 'Attio',
  folk: 'Folk',
  neon: 'Neon',
  supabase: 'Supabase',
  railway: 'Railway',
  render: 'Render',
  heroku: 'Heroku',
  digitalocean: 'DigitalOcean',
  'amazon rds': 'Amazon RDS',
  rds: 'Amazon RDS',
  aws: 'AWS',
  azure: 'Azure',
  'google cloud sql': 'Google Cloud SQL',
  cloudsql: 'Google Cloud SQL',
  cockroach: 'CockroachDB',
  cockroachdb: 'CockroachDB',
  timescale: 'Timescale',
  crunchy: 'Crunchy',
  tembo: 'Tembo',
  xata: 'Xata',
  prisma: 'Prisma',
};

export const KNOWN_DOMAINS = {
  hubspot: 'hubspot.com',
  salesforce: 'salesforce.com',
  pipedrive: 'pipedrive.com',
  close: 'close.com',
  copper: 'copper.com',
  zoho: 'zoho.com',
  freshsales: 'freshworks.com',
  attio: 'attio.com',
  folk: 'folk.app',
  neon: 'neon.tech',
  supabase: 'supabase.com',
  railway: 'railway.app',
  render: 'render.com',
  heroku: 'heroku.com',
  digitalocean: 'digitalocean.com',
  'amazon rds': 'aws.amazon.com',
  rds: 'aws.amazon.com',
  aws: 'aws.amazon.com',
  azure: 'azure.microsoft.com',
  'google cloud sql': 'cloud.google.com',
  cloudsql: 'cloud.google.com',
  cockroach: 'cockroachlabs.com',
  cockroachdb: 'cockroachlabs.com',
  timescale: 'timescale.com',
  crunchy: 'crunchydata.com',
  tembo: 'tembo.io',
  xata: 'xata.io',
  prisma: 'prisma.io',
};

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function rankSource(url, vendorDomains = []) {
  const domain = domainOf(url);
  const vendors = vendorDomains.map((item) => String(item).replace(/^www\./, '').toLowerCase()).filter(Boolean);
  const vendor = vendors.some((item) => domain === item || domain.endsWith(`.${item}`));
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = '';
  }
  if (vendor && PRIMARY_PATH.test(path)) return { tier: 1, tierLabel: 'Primary', domain };
  if (vendor) return { tier: 2, tierLabel: 'Vendor', domain };
  if (PRESS.has(domain) || [...PRESS].some((item) => domain.endsWith(`.${item}`))) {
    return { tier: 3, tierLabel: 'Press', domain };
  }
  if (WEAK_HOSTS.some((item) => domain === item || domain.endsWith(`.${item}`))) {
    return { tier: 5, tierLabel: 'Weak', domain };
  }
  return { tier: 4, tierLabel: 'Other', domain };
}

export function sortByRank(results) {
  return [...results].sort((a, b) => (a.tier - b.tier) || ((b.score || 0) - (a.score || 0)));
}

export function entitiesInText(text) {
  const source = String(text || '');
  const keys = Object.keys(KNOWN_DOMAINS).filter((key) => key.length >= 4).sort((a, b) => b.length - a.length);
  const hits = [];
  for (const key of keys) {
    const pattern = new RegExp(`(?:^|[^a-z0-9])(${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^a-z0-9])`, 'ig');
    let match;
    while ((match = pattern.exec(source))) {
      hits.push({ index: match.index, name: DISPLAY_NAMES[key] || key, domain: KNOWN_DOMAINS[key] });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set();
  const names = [];
  for (const hit of hits) {
    if (seen.has(hit.domain)) continue;
    seen.add(hit.domain);
    names.push(hit.name);
  }
  return names;
}

export function vendorDomainsFor(entities = [], evidence = []) {
  const found = [];
  for (const entity of entities) {
    const key = String(entity || '').toLowerCase().trim();
    if (KNOWN_DOMAINS[key]) found.push(KNOWN_DOMAINS[key]);
    const slug = key.replace(/[^a-z0-9]/g, '');
    if (slug.length < 4) continue;
    for (const item of evidence) {
      const domain = (item.domain || domainOf(item.url || '')).toLowerCase();
      if (domain && domain.replace(/\./g, '').includes(slug)) found.push(domain);
    }
  }
  return [...new Set(found.filter(Boolean))];
}
