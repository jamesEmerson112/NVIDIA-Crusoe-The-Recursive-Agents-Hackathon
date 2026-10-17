# Held-out evaluation: v1 vs v3

2026-10-17T22:02:33.274Z · 10 held-out renters never used in any generation · 300 listings (synthetic) · seed 42 · live Crusoe models · 32 LLM calls, $0.0069

| form | match quality | dealbreaker misses | questions asked | answered (mean) | skip rate | rewrite rate | friction | objective |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | 0.737 | 1/10 | 8 | 5.1 | 36% | 0% | 3.70 | 0.552 |
| v3 | 0.680 | 2/10 | 5 | 3.7 | 26% | 0% | 1.92 | 0.584 |

Match quality is the percentile of the final pick under the renter's hidden preferences (1 = their best listing, 0 = breaks their dealbreaker). Objective = match quality - 0.05 x friction.

v3 note: Promoted the renter rewrites for commute and budget (rewrites are stronger signal and both had negative value as written), and dropped parking, which every renter skipped.

| renter | behavior | v1 quality | v3 quality |
| --- | --- | --- | --- |
| gen_000 | answers_everything | 0.833 | 0.833 |
| gen_001 | answers_everything | 0.950 | 0.000 |
| gen_002 | skips_money | 0.789 | 1.000 |
| gen_003 | terse | 0.880 | 0.880 |
| gen_004 | answers_everything | 0.809 | 0.990 |
| gen_005 | terse | 0.960 | 0.960 |
| gen_006 | skips_all | 0.933 | 0.933 |
| gen_007 | skips_all | 0.385 | 0.385 |
| gen_008 | skips_money | 0.000 | 0.000 |
| gen_009 | answers_everything | 0.829 | 0.823 |
