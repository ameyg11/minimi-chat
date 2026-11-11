const TIER = {
  1: 'Primary',
  2: 'Vendor',
  3: 'Press',
  4: 'Other',
  5: 'Weak',
};

export function Citations({ citations, open, onOpen }) {
  if (!citations?.length) return null;
  return (
    <ol className="citations">
      {citations.map((citation) => {
        const active = open === citation.n;
        return (
          <li key={citation.id || citation.n} id={`cite-${citation.n}`} className={active ? 'citation open' : 'citation'}>
            <button type="button" onClick={() => onOpen(active ? null : citation.n)}>
              <span className="citation-n">{citation.n}</span>
              <span>{citation.title || citation.domain}</span>
              <em>{citation.tierLabel || TIER[citation.tier] || 'Source'}</em>
            </button>
            {active ? (
              <div className="citation-body">
                {citation.quote ? <blockquote>{citation.quote}</blockquote> : null}
                <p>
                  <a href={citation.url} target="_blank" rel="noreferrer">{citation.domain || citation.url}</a>
                  {citation.fetchedAt ? <time>{formatWhen(citation.fetchedAt)}</time> : null}
                </p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function formatWhen(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
