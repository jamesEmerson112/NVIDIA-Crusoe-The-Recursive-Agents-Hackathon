# 00. Digital fruit fly brain: overview

Research fan-out from 2026-10-17 (5 parallel researchers, reconciled here). Subject: Eon Systems'
claimed whole-brain emulation of *Drosophila* driving a simulated body, the stack it is built on,
and what an agent team at the Recursive Agents Hackathon can borrow from it.

| File | Covers |
|---|---|
| [01-eon-systems-emulation.md](01-eon-systems-emulation.md) | The announcement, what was actually built, critiques, count/accuracy confusion |
| [02-flywire-connectome.md](02-flywire-connectome.md) | The wiring diagram: numbers, gaps, related connectomes, data access |
| [03-whole-brain-spiking-model.md](03-whole-brain-spiking-model.md) | Shiu et al. 2024 LIF model: mechanics, validation, code, limits |
| [04-embodied-fly-body-simulation.md](04-embodied-fly-body-simulation.md) | NeuroMechFly v2 / FlyGym, flybody, brain-body coupling, the nerve-cord gap |
| [05-hackathon-agent-design-ideas.md](05-hackathon-agent-design-ideas.md) | Seven fly motifs mapped to agents; project ideas A-D with Crusoe budgets |

Claim labels used throughout: **[peer-reviewed]**, **[preprint]**, **[company claim]**,
**[press]**, **[code/docs]**, **[inference]**.

## Bottom line

1. **Eon's "digital fly" combines published parts and adds the closed loop; it does not emulate a
   fly.** The parts are the Shiu et al. 2024 leaky integrate-and-fire (LIF) whole-brain model on the
   FlyWire connectome, the NeuroMechFly v2 body in MuJoCo, and a Lappalainen-style visual network
   whose output Eon itself calls "decorative". Eon's new contribution is closing the loop: brain and
   body sync every 15 ms. **[company claim]**
2. **The brain chooses the behavior; the body's own controllers move the legs.** A handful of
   hand-picked output neurons (DNa01, DNa02, oDN1, antennal descending neurons, and the motor neuron
   MN9) steer walking controllers "trained to imitate the walking behavior of the fly". Eon says the
   mappings were "chosen by hand". **[company claim]** This is forced by the data: FlyWire stops at
   the neck, so its 1,303 descending neurons connect to nothing, and leg rhythm is generated in the
   nerve cord (VNC), which is not modeled. **[peer-reviewed]**
3. **The 2024 brain model has been validated; the embodied demo has not.** Shiu's model matched
   91% of 164 testable predictions (84% excluding the optogenetic screen) in feeding and grooming
   circuits. **[peer-reviewed]** The embodied demo has no paper, no released body or loop code, no
   quantitative validation, and no compute figures. **[company claim]**
4. **A fly that walks realistically tells you little about whether the brain model is right.** A
   2026 preprint walked a fly body with a *worm* connectome plus RL. **[preprint, via press]** Evidence for the
   brain model has to come from how sensory input maps to output-neuron activity (e.g. sugar → MN9),
   not from how fly-like the gait looks. **[inference]**
5. **The most useful lesson for the hackathon is an engineering one: most fly behavior runs in loops
   the brain only adjusts.** Run most of the agent loop in plain code, which costs no requests, and
   call LLMs only for high-level "descending commands". That is what fits under Crusoe's 30 requests
   per minute per model cap. (See 05.)

## How the stack fits together

```
FlyWire connectome (02)      Shiu LIF brain model (03)         NeuroMechFly v2 body (04)
139,255 neurons, ~54.5M  ->  weight = synapse count x sign  ->  MuJoCo physics, 87 joints*
synapses, cut at the neck    x one constant; untrained;         walking controllers trained
                             Brian2, Poisson sensory input      by imitation; no VNC model
                                       |                                 ^
                                       +-- a handful of hand-mapped -----+
                                           output neurons, synced every 15 ms (Eon, 01)
```
\* "87 joints" is from Eon's post; not confirmed in the NeuroMechFly papers.

## Numbers that disagree, explained

| Claim in coverage | What it actually is | Source |
|---|---|---|
| "125,000 neurons" | Rounded figure from the Shiu abstract ("more than 125,000") | **[peer-reviewed]** |
| 127,400 neurons | What Shiu's model actually simulated: FlyWire materialization v630 | Shiu Methods **[peer-reviewed]** |
| 139,255 neurons | Final FlyWire v783 proofread count; Eon's homepage uses it | Dorkenwald 2024 **[peer-reviewed]** |
| 138,639 neurons | Rows in the v783 neuron list Eon's public repo loads | **[code/docs]** |
| ~50M vs 54.5M synapses | Same data: abstract rounds to 5x10^7; main text says ~54.5M | **[peer-reviewed]** |
| "~5M synapses" (Eon README) | Probably connection-pair rows, not synapses (unverified) | **[inference]** |
| 91% accuracy | 91% of 164 testable predictions (84% excluding the split-GAL4 screen) | **[peer-reviewed]** |
| "95% accuracy" | Not an accuracy figure. In the paper, 95% is how often *perturbed* variants of the model agreed with the default model | **[peer-reviewed]**; misquoted in press |
| "Runs on a laptop" | ~5 CPU-thread minutes per simulated second, open loop with no body | **[peer-reviewed]** |

**Which connectome version drove the demo (v630 or v783) is undisclosed.**

## Still open after reconciliation

- **Was RL in the loop?** Eon's own post says imitation learning and hand mappings. The Transmitter
  says deep RL. File 04 notes the *published* NeuroMechFly v2 controllers are neither (CPG and
  rule-based), so Eon's imitation controller is an unpublished modification.
- **Closed-loop compute and real-time factor:** undisclosed. Eon's brain-only benchmark repo shows
  GPU backends around 1-2x real time, but its `realtime_ratio` metric and hardware are undefined.
- **Is a 15 ms sync adequate?** Eon says it "may be too slow for some behaviors". NeuroMechFly v2
  used 50 ms. No published comparison of sync intervals exists.
- **Eon's messaging is inconsistent:** its homepage says "no hand-coded behaviors" while its
  technical post says the mappings were chosen by hand.
- **BANC (brain + nerve cord) size:** 158k vs ~188k neurons across sources; the Nature 2026 paper
  was not read directly.
- **Data reproducibility:** a fresh FlyWire Codex v783 download may use the 2025 synapse set, so it
  may not reproduce the Nature papers. Pin your data version.

## Verified directly against primary sources

These checks were made while writing this overview, on top of the researchers' own sourcing:
- Eon's 10 Mar 2026 technical post ([eon.systems](https://eon.systems/updates/embodied-brain-emulation)).
  It confirms the Shiu LIF brain, NeuroMechFly v2 on MuJoCo, controllers "trained to imitate", the
  hand-chosen mappings, the 15 ms sync, the "decorative" vision, ~140,000 neurons with no version
  given, no compute figures, and the VNC listed as future work. It gives **no count** of
  output neurons; the researchers' early "about five" estimate was corrected in 03.
- Shiu et al. 2024 ([PMC11446845](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)). It
  confirms 91% of 164 (84% excluding the screen), the two "95%" figures that compare perturbed
  models with the default model, 127,400 neurons from v630, ~5 min CPU per simulated second, and the
  listed limitations.

## For the hackathon (details in 05)

- **Build Idea A + C:** a planner sends short commands to sub-agents; recovery, a goal tracker
  ("compass") and a "sleep pressure" monitor run as plain code, with state saved to disk.
- **Demo:** start a multi-hour run in the early afternoon. Show it as a time-lapse, plus one
  scripted live failure it recovers from.
- **Stretch: Idea D.** Use a real FlyWire ring circuit to choose which task gets the team's focus.
  Data access is cheap (the ~101 MB edge list); tuning the network is the risk. If tuning takes more
  than 3 hours, fall back to a hand-built ring with the same structure. Never run the whole-brain
  simulation live.
- **Before writing code:** four model IDs used in 05 are marked "confirm" in the Crusoe doc
  (Nemotron-3-Super, Nemotron-3-Nano, nemotron-3.5-lightning, DeepSeek-V4.1-Flash). Pin the exact
  strings from `GET /v1/models`.
- **Pitch framing:** borrowed control motifs, not emulation. Do not repeat "first brain upload".

## Weakest claims in this set

- The Verge quotes reached us secondhand.
- Whether Eon's 10 Mar post was edited after the criticism.
- Wissner-Gross's role: co-founder or "Founding Advisor".
- The Lin et al. network statistics come from the preprint (probably v630 data).
- The FlyWire licence for commercial use: CC-BY data vs CC-BY-NC annotations.
- Details of the Pugliese and "digital sphinx" preprints, read only at abstract or press level.
