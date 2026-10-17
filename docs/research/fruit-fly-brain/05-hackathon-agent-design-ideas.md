# 05. From fly brain to agent team: design ideas for the Recursive Agents Hackathon

Researcher lane: translation (biology to multi-agent LLM design). Compiled 2026-10-17. Other files in this folder cover Eon's announcement, FlyWire, the Shiu et al. model, and NeuroMechFly/flybody. Model IDs, rate limits, and caching facts come only from the local Crusoe skill file (`.claude/skills/crusoe-recursive-agents-hackathon/SKILL.md`, sections 4.4, 6, 8).

## TL;DR

- Eon's fly is a connectome-derived spiking brain (built on [Shiu et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)) coupled to a simulated body. Its claims are company-reported and not independently verified ([The Decoder](https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/)). We should borrow **control motifs**, not claim emulation.
- Seven motifs carry over: fixed sparse wiring, a brain-to-descending-neuron command hierarchy, CPG/reflex loops that run without the brain, inhibition-based arbitration, mushroom-body memory with reward-gated updates, a central-complex goal compass, and homeostatic "pressure" that forces recovery.
- The single most useful translation is engineering, not biology: **most of the fly's behavior runs in loops the brain only modulates.** Make most of your agent loop plain code (0 RPM), and call LLMs only for "descending commands". That is what survives Crusoe's 30 RPM per model limit.
- Top pick: **Idea A + C** below, a planner that issues descending commands to Lightning sub-agents, non-LLM reflex arcs for recovery, a goal compass that detects drift, and a sleep-pressure homeostat that compacts context and restarts workers. Idea D (literal FlyWire subcircuit) is feasible as a stretch, with honest caveats.

## 1. Principles that plausibly carry over

Strength tags: **[strong]** = the mechanism maps to a concrete agent mechanism; **[loose]** = useful metaphor, weak mechanistic match; **[speculative]** = our design idea, untested.

| # | Fly principle and biological basis | Agent analogue | Strength |
|---|---|---|---|
| 1 | **Fixed, sparse wiring.** The adult brain has 139,255 neurons and about 5x10^7 synapses ([Dorkenwald et al. 2024](https://doi.org/10.1038/s41586-024-07558-y)), so each neuron talks to a tiny fraction of the rest. A rich club of about 30% highly connected neurons contains subsets that look like integrators and broadcasters ([Lin et al. 2024](https://doi.org/10.1038/s41586-024-07968-y)). | Declare a static adjacency list of which agent may message which, instead of all-to-all chat. One or two hub agents integrate (aggregator) or broadcast (planner). This bounds message volume and makes traces debuggable. | [strong] as engineering, [loose] as biology |
| 2 | **Sensory, central, descending hierarchy.** Command-like descending neurons (DNs) recruit networks of other DNs; DNs with many descending partners drive only simple stereotyped movements without that recruitment; DN networks sit in behavior-specific clusters that inhibit one another ([Braun et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11186778/)). A single DN type (MDN) suffices to trigger backward walking ([Bidaye et al., Science 2014](https://www.imp.ac.at/news/moonwalker-flies-backing-up)). | The planner emits a short command from a fixed vocabulary (`FIX_TEST(x)`, `RESEARCH(q)`), not a full plan. Each command recruits a sub-team that expands it into a multi-step routine. Command clusters are mutually exclusive (cannot `REFACTOR` and `RELEASE` at once). | [strong] |
| 3 | **CPGs and reflex loops run without the brain.** Thoracic central pattern generators produce rhythm even without sensory input; descending input initiates and modulates them ([Frontiers in Physiology 2020 review](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2020.00135/pdf)). Connectome simulations point to a small rhythm-generating VNC circuit ([bioRxiv 2025 preprint](https://www.biorxiv.org/content/10.1101/2025.09.12.675944)), and decapitated flies can walk when DNs are driven ([The Transmitter on a 2026 preprint](https://www.thetransmitter.org/systems-neuroscience/long-sought-walking-circuit-found-in-fruit-flies/)). Robotics already borrowed this: high-level commands drive CPG-like controllers that respond to feedback ([Ramdya and Ijspeert 2023](https://infoscience.epfl.ch/handle/20.500.14299/199103)), as in Brooks' subsumption layers, where lower layers keep running while higher layers suppress them ([Brooks 1986](https://ieeexplore.ieee.org/document/1087032)). | Heartbeats, retry with jittered backoff, test runners, lint, file watchers, checkpointing, and 429 handling are deterministic loops in code. They keep running if every LLM is down. The LLM only changes their parameters (which test, which target). | [strong] (walking-CPG results are preprints) |
| 4 | **Excitation/inhibition arbitration.** Local excitation plus global inhibition keeps a single, persistent heading "bump"; an artificially induced second bump suppresses the first ([Kim et al. 2017](https://doi.org/10.1126/science.aal4835), [Simons summary](https://www.simonsfoundation.org/2017/08/01/in-fruit-fly-brain-a-ring-for-navigation/)). Grooming programs are primed in parallel but selected serially by a suppression hierarchy; cleaning a body part lowers its own drive, which releases the next program ([Seeds et al. 2014](https://elifesciences.org/articles/02951), [Hampel et al. 2017](https://elifesciences.org/articles/28804)). Lateral inhibition that scales with total input normalizes gain in the antennal lobe ([Olsen and Wilson 2008](https://wilson.hms.harvard.edu/publications/lateral-presynaptic-inhibition-mediates-gain-control-olfactory-circuit)). | Arbitration between competing proposals or tasks: each candidate has a "drive" score; a winner-take-all step with global inhibition picks one; finishing work lowers that task's drive, so the next one wins without the planner re-planning. Normalize scores by total load so a noisy agent cannot dominate. | [strong] for Kim and Seeds, [loose] for gain control |
| 5 | **Mushroom body memory.** About 2,000 Kenyon cells sparsely encode stimuli and converge onto 34 output neurons of 21 types whose ensemble valence biases action selection ([Aso et al. 2014](https://elifesciences.org/articles/04580)). Sparseness comes from feedback inhibition by the single APL neuron; breaking it impairs discrimination of similar odors ([Lin et al. 2014, Nat Neurosci](https://doi.org/10.1038/nn.3660)). Pairing an odor with specific dopamine neurons causes odor-specific depression at KC-to-output synapses, confined to compartments ([Hige et al. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4674068)). CS work already uses this: fly-style locality-sensitive hashing ([Dasgupta et al. 2017](https://www.salk.edu/news-release/fruit-fly-brains-inform-search-engines-future/)), sparse binary word embeddings ([Liang et al. 2021, FlyVec](https://arxiv.org/abs/2101.06887)), and reduced catastrophic forgetting by updating only active-key weights ([Shen, Dasgupta, Navlakha](https://arxiv.org/abs/2107.07617)). | Memory keyed by a sparse hash of the situation. After an outcome, a scalar "dopamine" signal updates only the active keys, and only in one valence compartment (approach or avoid) per strategy or tool. Similar situations share keys and generalize; dissimilar ones do not interfere. | [strong] (has real prior CS work) |
| 6 | **Central complex goal persistence.** Ellipsoid-body activity tracks heading and persists without visual or self-motion cues, a candidate short-term memory ([Seelig and Jayaraman 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4704792)). Goal and heading, both in world coordinates, are compared to produce a body-centered steering signal ([Mussells Pires et al. 2024](https://pubmed.ncbi.nlm.nih.gov/38326612/)). Path integration has an anatomically constrained model ([Stone et al. 2017](https://doi.org/10.1016/j.cub.2017.08.052)); the CX connectome shows motifs for context-dependent action selection ([Hulse et al. 2021](https://elifesciences.org/articles/66039)). | Keep a goal vector as persistent state outside any LLM context. Each cycle, estimate "heading" (direction of recent progress) and compute the error between heading and goal as a steering correction. Path integration becomes an append-only progress ledger that lets the team "return home" to the last good checkpoint. | [strong] on persistence, [speculative] on vector math for text tasks |
| 7 | **Homeostasis and self-monitoring.** Sleep-promoting dorsal fan-shaped-body neurons are the output arm of the fly's sleep homeostat; sleep loss raises their excitability ([Donlea et al. 2014](https://doi.org/10.1016/j.neuron.2013.12.013)). | Accumulate pressure variables (consecutive errors, tokens spent since progress, context length, minutes without a passing test). Over threshold, force a "sleep" phase: summarize, consolidate memory, restart the worker with a fresh context, then resume. | [loose] but practical |

## 2. Hackathon project ideas (about 10 hours, team of 4)

Model roles below use only IDs from SKILL.md 4.4. Confirmed IDs: `deepseek-ai/DeepSeek-V4-Pro`, `deepseek-ai/Deepseek-V4-Flash`, `openai/gpt-oss-120b`. "From docs table, confirm with `GET /v1/models`": `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/Nemotron-3-Super-120B-A12B`, `nvidia/Nemotron-3-Nano-30B-A3B`, `deepseek-ai/DeepSeek-V4.1-Flash`. Run `/v1/models` before 10 AM and pin the exact strings.

**Rate-limit arithmetic (SKILL.md section 6).** Without a payment method: 30 RPM and 500K TPM **per model**. Five roles on five distinct models gives a 150 RPM ceiling. All parallel workers on one model share that model's 30 RPM, so four Lightning workers get about 7 RPM each. Reflex loops in code cost 0 RPM. A planner with a 200K-token prompt can exhaust 500K TPM in about two calls (assume cached tokens still count toward TPM; SKILL.md does not say otherwise). Adding a payment method raises limits to 600 RPM and 2M TPM per model.

Suggested per-role budget for the A + C build (no payment method; leave about 20% headroom for retries):

| Role | Model | Instances | Budget (RPM) | Why it fits |
|---|---|---|---|---|
| Planner | `nvidia/Nemotron-3-Super-120B-A12B` | 1 | 2 to 5 | Called only on winner change or escalation (principle 2) |
| Arbiter | `nvidia/Nemotron-3-Nano-30B-A3B` | 1 | about 10 | Short prompts; could also be pure code |
| DN controllers | `nvidia/nemotron-3.5-lightning-30b-a3b` | 2 to 4 | 24 shared | The 30 RPM cap is per model, not per instance |
| Hands | `openai/gpt-oss-120b` | 2 to 4 | 24 shared | Tool calls dominate request count |
| Consolidator | `deepseek-ai/DeepSeek-V4.1-Flash` | 1 | under 1 | Runs only during "sleep" |
| Reflex arcs, compass, homeostat | none (code) | many | 0 | The CPG lesson: rhythm without the brain |

### Idea A: "Descending Command" team (hierarchy + reflex arcs + suppression scheduler)

- **Goal domain:** a measurable, long-running task, for example "implement these 25 functions from a spec until all tests pass" in a sandbox repo. Tests give a ground-truth progress signal.
- **Roles and models:** Brain/planner = `nvidia/Nemotron-3-Super-120B-A12B` (collaborative agents, tool use) or `deepseek-ai/DeepSeek-V4-Pro` for hard steps, called rarely. DN sub-controllers = `nvidia/nemotron-3.5-lightning-30b-a3b` (NVIDIA's "sub-agent workhorse"). Tool-executing hands = `openai/gpt-oss-120b` (most reliable tool calling per Crusoe). Arbiter/scorer = `nvidia/Nemotron-3-Nano-30B-A3B` or `deepseek-ai/Deepseek-V4-Flash`.
- **Topology (principle 1, 2):** static adjacency list in `wiring.yaml`. Planner talks only to the arbiter and DN controllers; each DN controller talks only to its hands and the shared blackboard; nobody else talks to the planner.

```text
                 +--------------------------+
                 |  Planner ("brain")       |   Super-120B or V4-Pro, 2-5 RPM
                 +------------+-------------+
                      ^       | descending command (fixed vocabulary)
       winner changes |       v
                 +----+---------------------+      +--------------------------+
 sensory layer ->|  Arbiter (drive, WTA)    |<---->|  Compass + Homeostat     |
 (tests, errors, |  Nano-30B or V4-Flash    |      |  (code; idea C)          |
  code only)     +------------+-------------+      +--------------------------+
                              | one winner task
              +---------------+---------------+
              v                               v
      +---------------+               +---------------+
      | DN controller |  Lightning    | DN controller |  Lightning
      +-------+-------+               +-------+-------+
              v                               v
      hands: gpt-oss-120b (tools)     hands: gpt-oss-120b (tools)
              |                               |
   ===========+=== reflex arcs in code (retry, backoff, rerun tests, revert) ===
              +--------> SQLite: tasks, drives, ledger, memory <--------+
```

- **Loop:** (1) code-level sensory layer gathers test results and errors; (2) arbiter computes drive per open task and picks one winner (principle 4, grooming-style: a task's drive drops as its tests pass); (3) planner issues one descending command only when the arbiter's winner changes or a DN escalates; (4) DN controller expands the command into steps for hands; (5) reflex arcs (retry, backoff, rerun tests, revert on red) run in code.
- **Walk-away story:** a supervisor process (tmux or systemd) restarts crashed workers; all state lives in SQLite (tasks, drives, ledger), so any process can die and resume. Reflex arcs absorb 429/503 with SKILL.md's jittered backoff.
- **Demo:** start the run early afternoon; show a time-lapse of tests passing; live, kill a worker and inject a synthetic 429 to show recovery from checkpoint.
- **Caching:** per-role byte-identical prefix (system prompt, tool schema, the role's wiring card), append-only history, changing state last. Print `cached_tokens / prompt_tokens` per role on the dashboard.

### Idea B: "Mushroom Body" memory module (bolt-on to A)

- **What it adds:** a memory that learns which strategy works in which situation, with no fine-tuning.
- **Mechanism (principle 5):** situation text (error type, file, failing test) becomes a dense vector, then a fly-style sparse hash: a sparse binary random projection into a much higher dimension (the fly goes from 50 projection neurons to 2,000 Kenyon cells, about 40-fold), then winner-take-all that keeps only the top about 5% ([Dasgupta et al. 2017](https://doi.org/10.1126/science.aam9868)). Each strategy has an approach and an avoid weight per active key. After an outcome, a scalar reward updates only the active keys in one compartment. At decision time the arbiter reads summed valence as a prior.
- **Constraint:** SKILL.md lists **no embedding model**. Compute embeddings locally (a small CPU sentence-transformer) or have `nvidia/Nemotron-3-Nano-30B-A3B` emit a fixed set of discrete features that you hash. Do not invent an embedding endpoint.
- **Walk-away story:** memory persists on disk, so restarts and "sleep" phases do not lose learning.
- **Demo:** run repeated task families; plot first-attempt success rate over time with memory on versus off. Show that learning on family X does not degrade family Y (the interference claim from Shen et al.).
- **Topology and caching:** the memory is code-side and talks only to the arbiter. Inject the valence prior at the **end** of the arbiter prompt so the arbiter's prefix stays byte-identical and cached.
- **Rate limits:** 0 extra RPM if embeddings are local; one Nano call per situation otherwise.

### Idea C: "Compass + Homeostat" supervisor (long-horizon persistence)

- **Compass (principle 6):** the goal is a checklist of N measurable sub-goals stored outside any context. Heading = sub-goals advanced in the last K cycles. When heading diverges from goal (for example 3 cycles of work on a sub-goal already done, or no progress), the compass emits a steering correction to the planner. The progress ledger supports "return home": revert to the last checkpoint whose tests were greener.
- **Homeostat (principle 7):** pressure counters (errors, tokens since progress, context length, wall time). Over threshold, the worker sleeps: `deepseek-ai/DeepSeek-V4.1-Flash` (lowest cached input price, $0.007 per 1M, designed for input-heavy loops) consolidates the long log into a summary plus memory updates; the worker restarts with a fresh prefix.
- **Caching trade-off:** sleep deliberately resets the prefix, so the first post-sleep call is cold (`cached_tokens` 0). Set thresholds so sleep is rare; thrashing destroys cache savings, which is a real analogue of sleep's cost.
- **Walk-away story:** compass and homeostat live in the supervisor process with state in SQLite, so they survive worker death and keep steering a restarted team toward the same goal.
- **Rate limits:** compass and homeostat are code (0 RPM); the consolidator runs under 1 RPM because it fires only on sleep.
- **Demo:** show the pressure gauges climbing and a sleep event on the dashboard, then the success rate recovering afterward.

### Recommended build split for A + C (B as stretch)

Person 1: supervisor, SQLite state, reflex arcs, fault injection. Person 2: planner, DN controllers, hands, wiring file. Person 3: arbiter, compass, homeostat (then Idea B). Person 4: dashboard (live RPM headroom from `x-ratelimit-remaining-requests`, cache hit rate, drives, pressure gauges), demo script, and pitch.

## 3. Literal connectome idea: a FlyWire subcircuit as the arbitration network (Idea D)

**Concept.** Take a small, functionally aligned subcircuit and run it as a rate model (numpy, milliseconds per step) that decides which agent or task gets the floor. Agent proposals inject input into designated nodes; the network's settled output picks the winner.

**Data path (cheap part, about 1 to 2 hours).** The Shiu repo ships `Connectivity_783.parquet` and `Completeness_783.csv` for the public v783 release (its code defaults to v630; switch config paths) ([repo](https://github.com/philshiu/Drosophila_brain_model)). Cell-type labels for v783 are in [flywire_annotations](https://github.com/flyconnectome/flywire_annotations) ([Schlegel et al. 2024](https://doi.org/10.1038/s41586-024-07686-5)); join on root IDs and collapse to a cell-type graph with pandas. The full synapse table with neurotransmitter predictions is on [Zenodo](https://zenodo.org/records/10676866) (about 130M rows, too heavy for today). We did not verify whether the parquet stores signs; derive them as Shiu does: a neuron is inhibitory if more than half of its presynaptic sites are predicted GABA or glutamate; dopamine, octopamine, and serotonin neurons are treated as excitatory; weight = synapse count times +1 or -1 times one free parameter ([Shiu et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)).

**Which subcircuit.** Node identity only means something if the motif matches the job:
- *CX compass (preferred):* the heading ring, meaning EPG compass neurons, PEN neurons that shift the bump during turns ([Turner-Evans et al. 2017](https://elifesciences.org/articles/23496)), and Delta7 neurons that tile the protocerebral bridge and supply global inhibition onto EPG cells ([2023 analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC10353971)), run as a ring attractor that holds the team's current focus among 8 or 16 sub-goals. Progress reports push the bump; global inhibition keeps one focus; persistence keeps it without new input (Kim 2017, Seelig and Jayaraman 2015).
- *DN clusters:* mutually inhibiting descending-neuron clusters (Braun 2024) as exclusive command families.

**Honest feasibility.** Medium-low for a faithful version in 10 hours. Risks: getting a stable bump from real weights needs tuning (time constants, gain, a baseline drive); Shiu's model has a 0 Hz baseline, so "inhibitory connections to an inactive neuron have no effect", which matters for arbitration; mapping agents onto neurons is arbitrary. **Fallback:** if tuning passes 3 hours, hand-build a ring with the same motif (local excitation, global inhibition) and keep the FlyWire extraction as a visualization of where the motif comes from. **Do not** run the whole-brain Brian2 model live: its raw output is several GB and the README gives no runtime. Prior art says connectome-constrained networks can predict real neural activity when trained ([Lappalainen et al. 2024](https://doi.org/10.1038/s41586-024-07939-3)), but whether connectomes help ML architectures is an open question ([connectomes as ANN architectures preprint](https://www.biorxiv.org/content/10.1101/2022.09.30.510374)). Pitch it as "a real fly motif doing arbitration", not "a fly brain running our agents".

## Risks and what not to overclaim

- **Eon's claims are unverified.** Press reports conflict on accuracy (91% versus 95%) and neuron count (139,255 versus about 125,000), and, per one report at the time, the brain-body coupling code had not been released ([LetsDataScience](https://letsdatascience.com/news/eon-systems-claims-virtual-fly-upload-4d5912f5), [The Decoder](https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/)). Do not repeat "first brain upload".
- **The underlying model is narrow.** Shiu's 91% is across 164 testable predictions in feeding and grooming circuits, 84% excluding one screen. The model omits neuromodulation, neuropeptides, gap junctions, and internal state, and does not model plasticity ([Shiu et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)).
- **Superficial metaphors.** An LLM agent is not a neuron; a "dopamine" signal is a reward scalar; a priority queue with decaying priority does what the grooming hierarchy does. Say which mechanism you copied (sparse keys plus gated updates, local excitation plus global inhibition) and drop the rest. NeuroAI advocates frame the goal as matching animal sensorimotor competence, not borrowing vocabulary ([Zador et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10033876)).
- **"Brain-inspired" can look like a gimmick to judges.** Lead with the walk-away behavior (hours of runtime, survived faults, measured recovery), and use the fly as the design rationale.
- **Demo pitfalls.** (1) 30 RPM per model: parallel workers on one model will 429; spread roles across models and throttle on headers. (2) Reasoning models with small `max_tokens` return empty `content`; budget 1024 or more and check `finish_reason` (SKILL.md 7.2). (3) A 5-minute run cannot show persistence; start the long run by early afternoon and present a time-lapse plus one scripted live fault. (4) Unconfirmed model IDs give 404s; pin IDs from `/v1/models`. (5) Cold caches on stage: warm each role once before presenting.
- **Framing to use:** "We are not emulating anything. We borrowed three or four control motifs from the fly nervous system and show they make an agent team cheaper to run and easier to leave alone."

## Sources

- Local: `.claude/skills/crusoe-recursive-agents-hackathon/SKILL.md` (sections 4.4, 6, 7.2, 8)
- https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/
- https://letsdatascience.com/news/eon-systems-claims-virtual-fly-upload-4d5912f5
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/
- https://github.com/philshiu/Drosophila_brain_model
- https://doi.org/10.1038/s41586-024-07558-y
- https://doi.org/10.1038/s41586-024-07968-y
- https://doi.org/10.1038/s41586-024-07686-5
- https://github.com/flyconnectome/flywire_annotations
- https://zenodo.org/records/10676866
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11186778/
- https://www.imp.ac.at/news/moonwalker-flies-backing-up
- https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2020.00135/pdf
- https://www.biorxiv.org/content/10.1101/2025.09.12.675944
- https://www.thetransmitter.org/systems-neuroscience/long-sought-walking-circuit-found-in-fruit-flies/
- https://infoscience.epfl.ch/handle/20.500.14299/199103
- https://ieeexplore.ieee.org/document/1087032
- https://doi.org/10.1126/science.aal4835
- https://www.simonsfoundation.org/2017/08/01/in-fruit-fly-brain-a-ring-for-navigation/
- https://elifesciences.org/articles/02951
- https://elifesciences.org/articles/28804
- https://wilson.hms.harvard.edu/publications/lateral-presynaptic-inhibition-mediates-gain-control-olfactory-circuit
- https://elifesciences.org/articles/04580
- https://doi.org/10.1038/nn.3660
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4674068
- https://www.salk.edu/news-release/fruit-fly-brains-inform-search-engines-future/
- https://doi.org/10.1126/science.aam9868
- https://elifesciences.org/articles/23496
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10353971
- https://arxiv.org/abs/2101.06887
- https://arxiv.org/abs/2107.07617
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4704792
- https://pubmed.ncbi.nlm.nih.gov/38326612/
- https://doi.org/10.1016/j.cub.2017.08.052
- https://elifesciences.org/articles/66039
- https://doi.org/10.1016/j.neuron.2013.12.013
- https://doi.org/10.1038/s41586-024-07939-3
- https://www.biorxiv.org/content/10.1101/2022.09.30.510374
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10033876
