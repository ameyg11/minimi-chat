export function Sidebar({ conversations, facts, timeline = [], activeId, open, onOpen, onNew, onClose }) {
  return (
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <span className="mark" aria-hidden="true" />
        <div>
          <p className="brand-name">minimi</p>
          <p className="brand-note">Remembers what it checked</p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close chats">Close</button>
      </div>
      <button type="button" className="new-chat" onClick={onNew}>New chat</button>
      <nav className="threads" aria-label="Past chats">
        {conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={conversation.id === activeId ? 'thread active' : 'thread'}
            onClick={() => onOpen(conversation.id)}
          >
            <span>{conversation.title}</span>
            <time>{formatShort(conversation.updatedAt)}</time>
          </button>
        ))}
        {!conversations.length ? <p className="empty-note">No conversations yet.</p> : null}
      </nav>
      <section className="timeline" aria-label="Timeline">
        <h2>Timeline</h2>
        {timeline.length ? timeline.map((item) => (
          <div key={item.entity}>
            <p className="timeline-entity">{item.entity}</p>
            {item.events.map((event, index) => (
              <p key={`${item.entity}-${index}`} className="timeline-event">
                <time>{formatShort(event.at)}</time>
                {' '}
                {event.sameHash ? 'Same page. ' : ''}
                {event.display || event.aspect}
              </p>
            ))}
          </div>
        )) : <p className="empty-note">No pages saved yet.</p>}
      </section>
      <section className="facts" aria-label="What I know">
        <h2>What I know</h2>
        {facts.length ? facts.map((fact) => (
          <p key={fact.id}><strong>{fact.key}.</strong> {fact.value}</p>
        )) : <p className="empty-note">Preferences you mention will land here.</p>}
      </section>
    </aside>
  );
}

function formatShort(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));
}
