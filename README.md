# trace chat

A chat agent with one tool, web search. It remembers what you asked and the page it read, then checks later whether that answer is still true.

## Run

Node 20 or newer. MongoDB local or Atlas.

```bash
cp .env.example .env
npm install
npm run dev
```

On Windows, copy `.env.example` to `.env` instead of `cp`. Open http://localhost:5173.

The server listens on port 3001. The client proxies `/api` there. Keys stay on the server.

## Keys

`.env.example` lists every key:

- `GEMINI_API_KEY` — planning, extraction, and the reply
- `TAVILY_API_KEY` — search and page extracts
- `MONGODB_URI` — the memory

If one is missing, the process names it and exits.

Optional: `LLM_FAST_MODEL` (default `gemini-3.5-flash`), `LLM_ANSWER_MODEL` (default `gemini-3.5-flash`), `USER_TIMEZONE` (default `Asia/Kolkata`), `PORT`.

## Try

1. Ask a pricing question and name the products.
2. Later, in any thread: "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"
3. "What did I ask you on 3 November? Is your answer still correct today?"

That last one only works if a conversation actually happened that day. If it did not, the agent says so.

`npm run seed` inserts one labeled practice conversation on 3 November 2026 about Neon. The price in it is fixture data, not a historical reading. A re-check compares that fixture with the live page. The seed does not run on startup, and it refuses to insert twice.

`npm test` covers the calendar, price diffs, the unchanged-page short circuit, source ranking, and dropping unsourced numbers. It does not call the network.

How the loop is put together, and what it refuses to do, is in `DESIGN.md`.
