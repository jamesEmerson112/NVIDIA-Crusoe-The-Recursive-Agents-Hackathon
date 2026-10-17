# formloop

A self-improving apartment intake form for San Francisco renters. The form is the product: agents learn
from how people answer, skip and reword its questions, and a new version is kept only if it beats the old
one on simulated renters it has never seen. Built on Crusoe Managed Inference.

## How it works

**Inner loop: one renter.** The renter answers a short form where every question is optional and each has
skip, edit-the-question and an importance slider. An extractor agent turns answers, rewritten questions and
weights into structured preferences. The matcher ranks listings, shows the top ones, takes a like or a pass
with a reason, turns the reason into a new preference and re-ranks.

**Outer loop: future renters.** Every question's reactions are logged: skips, rewrites, seconds spent, and how
much the answer changed the recommendation, measured by re-running the match without it. After each batch
a reviewer agent reads those numbers plus `research/NOTES.md` and proposes the next form version. It can
reword, reorder or drop a question, or promote a renter's rewrite into a new one. Both versions then run on a
fresh batch of simulated renters. The new version is saved and git-committed with its score only if it wins.

**Scoring.** Each simulated renter has hidden preferences and a dealbreaker. Match quality is the percentile
of the final pick under the renter's true preferences: 1 means their best listing, 0 means it breaks their
dealbreaker. Question value is the quality drop when that answer is removed, minus friction.
Objective = quality − friction weight × friction.

## Commands

From `formloop/`, with Node 24.22.0:

```
npm ci                      # install (yaml + type checking only)
npm run validate            # check research/ files
npm run loop                # one renter end to end, verbose
npm run generation          # one outer-loop generation (commits an accepted form)
npm run eval                # held-out renters: form v1 vs the latest, table saved to ../results/
npm run serve               # two-pane demo at http://localhost:5190
npm run listings -- --source youcom   # fetch and cache public listings via You.com
```

Add `-- --offline` to `loop`, `generation` or `eval` to use rule-based renters and agents with no API
calls. Without a Crusoe key, they run that way automatically.

**Keys.** These are read from the environment, then `formloop/.env`, then `frontend/.env`:
- `CRUSOE_API_KEY`: store it with `node ../frontend/scripts/set-key.mjs`.
- `YDC_API_KEY`: for the You.com search API.
- `CRUSOE_BASE_URL`: optional.

Models are set per role in `config.yaml`: simulator, extractor, normalizer and reviewer. You can also
override one with `CRUSOE_<ROLE>_MODEL`.

**Listings.** By default they're synthetic, seeded and reproducible: 300 units across 20 neighborhoods, with
price, bedrooms, floor, layout, laundry, parking, pets, street noise and commute minutes to four
destinations. Set `listings.source: both` in `research/eval_config.yaml` to add real public listings cached
from You.com. The cache is gitignored because it holds third-party listing content.

## For researchers

You steer the loop by editing the files in `research/` at the repo root. No code changes needed.

| File | What it controls |
| --- | --- |
| `research/question_bank.yaml` | The starting form (v1): each question's id, wording, type, options and which listing fields it informs. |
| `research/personas.yaml` | Hand-written training renters: a short in-character blurb, how they fill out forms (`behavior`), their hidden true preferences with weights, and one dealbreaker. |
| `research/eval_config.yaml` | How a run works: seed, listing count, batch sizes, questions shown, friction costs, recommendations per round. Keep batches small (30 requests/minute limit). |
| `research/NOTES.md` | Your running findings on form design. The reviewer agent reads the whole file every time it proposes a new form version. |

Held-out test renters are generated from code, never taken from `personas.yaml`, so editing the
seed personas can't leak into the final eval.

Every file is validated when it loads. A mistake stops the run with a message naming the file and
the entry, for example:

```
research/personas.yaml: personas[3] (id "dana"): hidden[1].op "below" must be one of max, min, in, not_in, eq
```

All problems are listed at once. Unknown keys only print a warning.

One command each, from `formloop/`:

```
npm run validate     # check all research files, print a summary
npm run generation   # run one outer-loop generation
npm run eval         # held-out renters: form v1 vs the latest form
```

Logs for analysis:
- `formloop/logs/reactions.jsonl`: one row per renter per question.
- `formloop/logs/generations.jsonl`: one row per generation, accepted or not.

To check a copy of the files somewhere else: `FORMLOOP_RESEARCH_DIR=/path/to/copy npm run validate`.
