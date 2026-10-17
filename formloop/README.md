# formloop

A self-improving apartment intake form for San Francisco renters.

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

Commands (from the repo root):

```
cd formloop && npm run validate   # check all research files, print a summary
npm run generation                # run one outer-loop generation
npm run eval                      # held-out renters: form v1 vs the latest form
```

To check a copy of the files somewhere else: `FORMLOOP_RESEARCH_DIR=/path/to/copy npm run validate`.
