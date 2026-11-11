import { useState } from 'react';
import { Findings } from './Findings.jsx';
import { Citations } from './Citations.jsx';
import { Trace } from './Trace.jsx';

const CONFIDENCE = {
  high: 'Sourced',
  medium: 'Fairly sure',
  low: 'Unsure',
  abstain: 'Not enough to say',
};

export function Message({ message }) {
  const [openCite, setOpenCite] = useState(null);
  if (message.role === 'user') {
    return (
      <article className="message message-user">
        <p>{message.content}</p>
        <time>{formatWhen(message.createdAt)}</time>
      </article>
    );
  }
  return (
    <article className="message message-assistant">
      <Prose text={message.content} onCite={setOpenCite} />
      <Findings findings={message.findings || []} />
      <Citations citations={message.citations || []} open={openCite} onOpen={setOpenCite} />
      <Trace trace={message.trace || []} />
      {CONFIDENCE[message.confidence] ? <p className={`confidence confidence-${message.confidence}`}>{CONFIDENCE[message.confidence]}</p> : null}
    </article>
  );
}

function Prose({ text, onCite }) {
  const parts = String(text || '').split(/(\[\d+\])/g);
  return (
    <div className="prose">
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return <span key={index}>{part}</span>;
        return (
          <button key={index} type="button" className="cite" onClick={() => onCite(Number(match[1]))}>
            {match[1]}
          </button>
        );
      })}
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
