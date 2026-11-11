# How it works

A turn does not start with a search. The date in the question is resolved in code (`Asia/Kolkata` by default), then a small model picks a short step list: recall, reverify, delta, research, or chat. "What did I ask on 3 November, and is it still correct?" is two steps. Recall never opens the web.

Memory is a ledger, not a transcript stuffed into the prompt. Each checkable fact is a claim: entity, aspect (price, launch, feature), qualifier, normalized value, verbatim quote, and the evidence snapshot it came from. Snapshots store the page text, a content hash, the source tier, and when we fetched it. A later fetch of the same URL is a new row. If the hash matches, the price is unchanged and no model reads the page. If it differs, we extract claims and diff them against the old ones. Money is compared only when both sides state a period and a basis; `$180/year` can match `$15/month`, but a bare `$15` is "I can't tell," not "changed." A launch counts as big only when extraction marks a new product, a pricing-model change, or a general-availability release.

Search is budgeted. A new question gets at most three searches and four page reads, and stops early once every named entity has a primary-source quote. A re-check refetches the saved URLs first and searches at most twice, only if a URL is dead. A "what changed" question refetches first, then at most one query per entity, capped at five. Pages are ranked in code: the vendor's pricing, docs, or changelog, then the rest of that site, then a short press list, then everything else. Reddit and blogs can hint, but a price with no better source is dropped. So is any claim whose quote is not actually on the page, and any currency figure in the reply that no quote contains.

If that day has no conversation, or the refetch fails, the reply says so. A failed fetch is never rewritten as "still correct." When several past threads fit a check, the agent asks which one. One deployment shares one memory, so a new chat does not forget. Durable preferences (team size, a tool they already use) are stored from the planner and shown in the sidebar. The voice is allowed to disagree when a quote does; it does not praise the question.

# Why this shape

The three evaluation questions are about time. "Last Tuesday" is a calendar lookup plus a fallback week when that day is empty, because the phrase is ambiguous and the messages decide. A vector index would fuzzy-match "Postgres" and still not know the old price. Keeping the quote and the hash is what makes a later diff possible. Two model tiers keep the wait short: a fast model plans and extracts, a stronger one writes only after the evidence is already decided. The loop is plain functions so a reader can follow one turn without a framework.

# Rejected

Searching on every message. It is slow, and it contaminates "what did I ask?" with today's web. Putting the whole transcript in the prompt. Prices get paraphrased and cannot be diffed. A vector database as the main memory. An agent framework or a swarm. Background monitoring. Letting the model own the calendar. Seeding a fake 3 November conversation on startup. `npm run seed` can insert a labeled fixture for practice; it does not run by itself.

# Another week

Fuzzy recall for "that Postgres thing" when the name is missing. A second fetch path for pricing pages that come back empty. A frozen eval of the three sample questions, with saved snapshots, so a diff can be checked without the live web.
