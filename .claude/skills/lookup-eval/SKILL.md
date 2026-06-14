---
description: Run the prompt-output eval harness and interpret the results
---

# Lookup eval

The eval harness in `eval/` guards `lookup.js`'s output contracts — the product's
core value. Use it after any change to the prompts in `src/lookup.js`, or when the
user asks to "run the eval", "check the prompts", or "test lookup output".

## What the harness does

- `eval/golden.js` — ~18 representative words/patterns (the 見る family, multi-sense
  verbs, abstract nouns, N3 grammar).
- `eval/checks.js` — deterministic validators: every kanji wrapped in `<ruby>`,
  output matches the mode's JSON contract, exact sentence count (vocab 5 / grammar 4),
  ≥3 distinct valid registers, populated `confused_with`.
- `eval/snapshots/*.json` — saved output, one per golden case.

## Commands

- `npm run eval:check` — **default.** Runs checks against saved snapshots. No API
  calls, free, fast. This is the gate.
- `npm run eval:update` — re-runs every golden case through the live API and
  overwrites snapshots. Costs ~18 API calls and runs serially (the org's
  output-token/min rate limit forbids parallelism). Use `node eval/run.js update
  --missing` to fill only absent snapshots.
- `npm run eval` — live lookups checked against fresh output, without writing
  snapshots. Exits nonzero on failure.

## How to use it

1. Default to `npm run eval:check` unless the user clearly wants fresh API output.
2. Read the report. Each `✗` lists the failing check and a precise message
   (e.g. `kanji-ruby: sentences[2].jp: 1 un-ruby'd kanji (少)`).
3. **Interpret, don't just relay.** Group failures by check:
   - `kanji-ruby` failures → a prompt-compliance gap in `src/lookup.js`. Point at
     the specific field/sentence and the offending kanji.
   - `contract` / `sentence-count` / `registers` → the model drifted from the schema
     or the SENTENCE RULES; suggest the prompt section to tighten.
   - `ERROR: Failed to parse … JSON` → truncation; the entry exceeded `max_tokens`
     in `lookup.js`. Raise it or trim the prompt.
4. After editing a prompt, run `npm run eval:update`, then **review the snapshot diff
   before trusting it** — confirm the change fixed the target without degrading other
   fields — and finish with `npm run eval:check` green.

## Don't

- Don't loosen a check in `eval/checks.js` to make the gate pass — that defeats the
  purpose. Fix the output (the prompt) instead, or raise the issue with the user.
- Don't run `eval:update` in parallel or raise `CONCURRENCY` — the rate limit will 429.
