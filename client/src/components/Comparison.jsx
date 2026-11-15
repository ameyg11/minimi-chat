export function Comparison({ rows }) {
  if (!rows?.length) return null;
  return (
    <table className="compare">
      <caption>Pricing comparison</caption>
      <thead>
        <tr>
          <th>Product</th>
          <th>Plan</th>
          <th>Price</th>
          <th>Period</th>
          <th>Team</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.entity}-${row.plan}-${index}`}>
            <td>{row.entity}</td>
            <td>{row.plan || '—'}</td>
            <td>{row.price}</td>
            <td>{row.period || '—'}</td>
            <td>{row.teamTotal ? `${row.teamSize} × ${money(row.teamTotal)}/mo` : '—'}</td>
            <td>{row.url ? <a href={row.url}>{host(row.url)}</a> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function money(amount) {
  const rounded = Math.round(Number(amount) * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}
