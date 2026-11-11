import { useEffect, useRef } from 'react';
import { Message } from './Message.jsx';

export function Chat({ messages, streaming, status, busy }) {
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming, status]);

  const empty = !messages.length && !streaming && !busy;

  return (
    <section className="chat" aria-live="polite">
      {empty ? (
        <div className="empty">
          <p className="empty-kicker">A chat that keeps the source</p>
          <h1>Ask something you may want to check later.</h1>
          <p>I’ll remember the question and the page it came from. Come back and ask whether it’s still true.</p>
        </div>
      ) : null}
      {messages.map((message) => <Message key={message.id} message={message} />)}
      {busy && (status || streaming) ? (
        <article className="message message-assistant draft">
          {status ? <p className="status" role="status">{status}</p> : null}
          {streaming ? <div className="prose">{streaming}</div> : null}
        </article>
      ) : null}
      <div ref={end} />
    </section>
  );
}
