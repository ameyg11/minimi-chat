export function Trace({ trace }) {
  if (!trace?.length) return null;
  return (
    <details className="trace">
      <summary>{trace.length} {trace.length === 1 ? 'step' : 'steps'}</summary>
      <ol>
        {trace.map((item, index) => (
          <li key={`${item.at}-${index}`}>
            <time>{formatTime(item.at)}</time>
            <span>{item.detail}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
