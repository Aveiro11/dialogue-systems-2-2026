# VG-RAG Report

## Question addressed

*"Are there better ways to create embeddings for your points? Consider
different embedding models and their parameters, different prompts for
embedding models."*

*"Should you return different number of query results (currently it is
limited to 5 results)? Can you implement filtering and re-ranking for
query results?"*

I ended up testing the first question somewhat by accident. I originally
set out to test something else (whether using the last few conversation
turns instead of just the latest utterance improves retrieval) and that
test led me here. The second experiment follows on from that, since
once I realised similarity scores were unreliable for one query, I
wanted to check whether they were reliable at all, which led into the
filtering/re-ranking question.

## Experiment 1: does using more context help retrieval?

### Background: what I was originally testing

My RAG `Retrieve` state only embedded the single latest user utterance
to query Qdrant. I wanted to check if that caused problems in real
conversations, where a followup question often doesn't repeat the
topic. I tested this two ways: first with plain CLI queries and then live
in the running app.

The CLI test looked fine on the surface:

- Query `"what's the phone number"` (no topic) → the correct Feelgood
  chunk ranked 3rd, score 0.541
- Query `"Feelgood phone number"` (topic included) → the correct chunk
  ranked 1st, score 0.673

So adding the topic word clearly helped. I implemented a fix that
concatenates the last two user turns before embedding, instead of just
the latest one, expecting this to fix ambiguous follow-ups
automatically.

### What actually happened when I tested it live

I tried this conversation in the running app:

1. Me: "Tell me about feel good"
2. Console: retrieved completely unrelated chunks (about study
   support and revising texts), and honestly said it was confused
   about what I meant.
3. Me: "Yes" (trying to confirm I did mean Feelgood)
4. Console: still retrieved irrelevant chunks, and because it had
   already committed to a wrong guess in step 2, it just kept going
   in the wrong direction and gave me stress relief tips instead of a
   phone number.

This surprised me, because I said "feel good" clearly and expected the
embedding search to find the Feelgood healthcare page. My multi-turn
concatenation fix didn't help here at all, because the problem wasn't
missing context from previous turns — the problem was that even the
single utterance "feel good" wasn't matching the right document.

### Digging into why: is it a wording problem?

I compared three queries directly against Qdrant, outside of the app,
to isolate the issue:

| Query | Feelgood chunk rank | Score |
|---|---|---|
| `"feel good"` | not in top 5 at all | — |
| `"Feelgood"` | 5th (last place) | 0.482 |
| `"Feelgood phone number"` | 1st | 0.673 |

This was the most surprising part for me. I expected `"Feelgood"` on
its own (the exact proper noun, spelled exactly as it appears in the
source documents) to retrieve the right chunk easily. Instead it barely
made it into the top 5, and scored lower than several completely
unrelated results about disability study support and revising academic
texts.

Meanwhile `"feel good"` (the natural spoken version, which is also what
my speech recognizer actually transcribed when I spoke out loud)
retrieved *nothing* relevant in the top 5.

### My interpretation

A few things seem to be going on:

1. **Short queries embed poorly with this model.** Single words or
   very short phrases don't seem to carry enough signal for
   `qwen3-embedding` to distinguish them well from unrelated content.
   Once I added more words (`"Feelgood phone number"`), retrieval
   quality jumped a lot. This suggests the embedding model relies on
   more surrounding context to place a query correctly in vector
   space, rather than doing anything like exact keyword matching.

2. **Speech-to-text makes this worse.** My ASR transcribed "Feelgood"
   as two lowercase words, "feel good," which further pushed the
   query embedding away from the source text's usage (a single
   capitalized proper noun/brand name). This is a real risk for a
   voice-first RAG system specifically, since users can't type exact
   spelling and speech recognizers often "normalize" brand names into
   ordinary words.

3. **My multi-turn fix (concatenating previous turns) doesn't address
   this at all.** It only helps when a previous turn already contains
   good topic words. If the very first mention of a topic embeds
   poorly (like "feel good" did), concatenating it with a later "Yes"
   doesn't add any new useful signal, and can even reinforce the LLM's
   incorrect first guess in later turns.

### What I'd try if I kept working on this

- **Try a different embedding model or higher dimensionality.** I used
  `qwen3-embedding` truncated to 384 dimensions purely because that's
  what the tutorial used. It's possible a full dimension embedding or
  a different model altogether, handles short/ambiguous queries better.
  I didn't have time to test this directly but it's the most direct
  next step.
- **Expand short queries before embedding them**, e.g. by asking the
  LLM to rephrase a short user utterance into a fuller question before
  it gets embedded, instead of embedding raw ASR output directly. Given
  that `"Feelgood phone number"` retrieved so much better than
  `"Feelgood"` alone, even a rough automatic expansion could help.
- **Add explicit synonym/alias handling for known entity names**
  (e.g. mapping "feel good" → "Feelgood" before querying), since this
  is a narrow, fixable case rather than a fundamental limitation.
- **Only trust retrieval when the top score clears a threshold** — I
  actually went and tested this idea directly, see Experiment 2 below.
  Spoiler: it didn't work as cleanly as I hoped either.

## Experiment 2: can a similarity score threshold filter out irrelevant results?

### What I wanted to test

Since Qdrant always returns results even when nothing relevant exists
in the collection, I wanted to add a minimum score threshold in my
`queryRAG` actor, so that low-confidence retrievals get dropped instead
of being passed to the LLM as if they were reliable context. My first
guess was a random threshold around 0.4, picked somewhat arbitrarily based on
the score gaps I'd seen in Experiment 1.

Before committing to a number, I wanted actual evidence for where a
reasonable cutoff should sit, so I ran three different types of queries
against the collection and compared their top scores:

| Query type | Example | Top score |
|---|---|---|
| Specific, on-topic | "Feelgood phone number" | 0.673 |
| Vague, on-topic | "how do I get help with my studies" | 0.732 |
| Completely off-topic | "what's the weather like today" | 0.568 |

### What I found

There is no clean score cutoff that separates relevant from irrelevant
results in my collection. The off topic weather query still scored
0.568 higher than several genuinely relevant results from my
on topic Feelgood query (a few of those scored between 0.57 and 0.59).
Meanwhile the vague-but-relevant "how do I get help with my studies"
query scored *highest* overall (0.732), even higher than the specific
Feelgood query.

This means a single fixed threshold, like the 0.4 I originally
considered, would not have worked. It would happily let the weather
query's irrelevant results through, since they comfortably clear 0.4,
while doing nothing useful to separate good from bad matches elsewhere.

### Why I think this happens

My best guess is that many of my document chunks are quite short
(page titles, section headers like "Online placement test" or
"Applying for and being granted study support"), so their embeddings
end up sitting fairly close together in vector space regardless of
topic. The model may be picking up on "this is short, formal,
GU-website-style English text" almost as much as it's picking up on
actual topical content, which flattens out the score differences
between relevant and irrelevant chunks.

### What I'd try instead

- **A relative threshold** instead of an absolute one — e.g. only trust
  a result if its score is meaningfully higher than the next-best
  result in the same query, rather than comparing it to a fixed number
  that has to work across every possible query.
- **Chunking full sections instead of short headers and titles**, so
  every stored chunk carries more distinguishing content. This might
  spread out the scores more meaningfully, since right now a lot of my
  chunks are quite short and generic.

I did not have time to implement any of these alternatives. Given this
finding, I decided not to ship the fixed-threshold filter in my actual
`dm.ts` code, since the evidence here shows plainly it would not behave
reliably. Instead I only kept tuning the number of results returned
(`limit`), which is a simpler, more honest reflection of what I
actually validated.

## Evidence files

Raw terminal output for the queries in Experiment 1 is available in
`vg-rag-evidence-vocab.txt` in this folder. Raw terminal output for the
queries in Experiment 2 is available in `vg-rag-evidence-threshold.txt`
in this folder.