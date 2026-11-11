import { useEffect, useState } from 'react';
import { getConversations, getConversation, getFacts, streamChat } from './api.js';
import { Sidebar } from './components/Sidebar.jsx';
import { Chat } from './components/Chat.jsx';
import { Composer } from './components/Composer.jsx';

export function App() {
  const [conversations, setConversations] = useState([]);
  const [facts, setFacts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    refreshLists().then((rows) => {
      if (rows[0]) openConversation(rows[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  async function refreshLists() {
    const [conversationBody, factBody] = await Promise.all([getConversations(), getFacts()]);
    setConversations(conversationBody.conversations);
    setFacts(factBody.facts);
    return conversationBody.conversations;
  }

  async function openConversation(id) {
    setActiveId(id);
    setSidebarOpen(false);
    setStreaming('');
    setStatus('');
    setError('');
    const body = await getConversation(id);
    setMessages(body.messages);
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setStreaming('');
    setStatus('');
    setError('');
    setSidebarOpen(false);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    setError('');
    setStreaming('');
    setStatus('Reading the question');
    const optimistic = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    let nextId = activeId;
    try {
      await streamChat({
        conversationId: activeId,
        message: text,
        onEvent: (event, data) => {
          if (event === 'status') setStatus(data.detail || '');
          if (event === 'meta' && data.conversationId) {
            nextId = data.conversationId;
            setActiveId(data.conversationId);
          }
          if (event === 'token') setStreaming((prev) => prev + (data.text || ''));
          if (event === 'error') setError(data.message || 'The reply failed.');
          if (event === 'done') {
            nextId = data.conversationId || nextId;
            setActiveId(nextId);
            setMessages((prev) => [
              ...prev.filter((item) => !String(item.id).startsWith('local-')),
              data.userMessage,
              data.message,
            ].filter(Boolean));
            setStreaming('');
            setStatus('');
            if (data.facts) setFacts(data.facts);
          }
        },
      });
      await refreshLists();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        facts={facts}
        activeId={activeId}
        open={sidebarOpen}
        onOpen={openConversation}
        onNew={newChat}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main">
        <header className="topbar">
          <button type="button" className="menu" onClick={() => setSidebarOpen(true)}>Chats</button>
          <p className="topbar-title">minimi</p>
        </header>
        <Chat messages={messages} streaming={streaming} status={status} busy={busy} />
        {error ? <p className="error" role="alert">{error}</p> : null}
        <Composer
          value={draft}
          busy={busy}
          onChange={setDraft}
          onSend={send}
        />
      </main>
    </div>
  );
}
