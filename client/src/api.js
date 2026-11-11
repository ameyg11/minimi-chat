export async function getConversations() {
  const res = await fetch('/api/conversations');
  if (!res.ok) throw new Error('Could not load conversations.');
  return res.json();
}

export async function getConversation(id) {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) throw new Error('Could not load that conversation.');
  return res.json();
}

export async function getFacts() {
  const res = await fetch('/api/facts');
  if (!res.ok) throw new Error('Could not load what I know.');
  return res.json();
}

export async function streamChat({ conversationId, message, onEvent, signal }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ conversationId, message }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      onEvent(event, JSON.parse(data));
    }
  }
}
