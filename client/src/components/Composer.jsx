export function Composer({ value, busy, onChange, onSend }) {
  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <label className="sr" htmlFor="message">Message</label>
      <textarea
        id="message"
        rows="1"
        placeholder="Ask, or ask what changed"
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" disabled={busy || !value.trim()}>Send</button>
    </form>
  );
}
