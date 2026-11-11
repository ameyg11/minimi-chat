const LABELS = {
  changed: 'Changed',
  unchanged: 'Unchanged',
  unverifiable: 'Couldn’t check',
  not_comparable: 'Can’t compare',
  not_big: 'Nothing big',
  conflict: 'Sources disagree',
  sourced: 'Sourced',
};

export function Findings({ findings }) {
  if (!findings?.length) return null;
  const rows = findings.filter((finding) => finding.aspect !== 'other' || finding.before || finding.after);
  if (!rows.length) return null;
  return (
    <ul className="findings">
      {rows.map((finding, index) => (
        <li key={`${finding.entity}-${finding.aspect}-${index}`} className={`finding finding-${finding.status}`}>
          <div className="finding-head">
            <strong>{finding.entity}</strong>
            <span>{finding.qualifier || finding.aspect}</span>
            <em>{LABELS[finding.status] || finding.status}</em>
          </div>
          <p className="finding-values">
            {finding.before ? <span>{finding.before}</span> : null}
            {finding.before && finding.after ? <span className="arrow">→</span> : null}
            {finding.after ? <span>{finding.after}</span> : null}
          </p>
          {(finding.beforeAt || finding.afterAt) ? (
            <p className="finding-dates">
              {finding.beforeAt ? <time>{formatDay(finding.beforeAt)}</time> : null}
              {finding.beforeAt && finding.afterAt ? <span> → </span> : null}
              {finding.afterAt ? <time>{formatDay(finding.afterAt)}</time> : null}
            </p>
          ) : null}
          {finding.note ? <p className="finding-note">{finding.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function formatDay(iso) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));
}
