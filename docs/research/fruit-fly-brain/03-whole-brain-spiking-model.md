# 03 - The Whole-Brain Spiking Model (the "brain" that runs on the wiring)

Researched 2026-10-17. Evidence labels: **[peer-reviewed]**, **[preprint]**, **[code/doc]** (repo READMEs, data files), **[company post]** (Eon's own blog/site), **[press]**. Arithmetic marked **(my calc)** is mine, not the source's.

## TL;DR

- The "brain" in Eon's digital fly is, as far as public material shows, the **Shiu et al. leaky integrate-and-fire (LIF) model** ([Nature, published 2 Oct 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/); bioRxiv preprint 2 May 2023). Every FlyWire neuron is the same simple point neuron. Each connection weight is just **synapse count x sign (from predicted neurotransmitter) x one global constant**. Nothing is trained. **[peer-reviewed]**
- It runs in the **Brian2** spiking simulator (Python). Sensory neurons get **Poisson spike trains**, and you read out downstream spiking, e.g. proboscis motor neuron **MN9**. The paper's cost figure is **about 5 min of CPU-thread time per 1 s of simulated brain**. That is what the "runs on a laptop" headline rests on. **[peer-reviewed]** / **[press]**
- Validation: **91% of 164 testable predictions** matched experiments (84% if the split-GAL4 optogenetic screen is excluded). The predictions cover sugar/water taste to feeding and antennal touch to grooming circuits. With a shuffled connectome, MN9 activated in **1/100** runs, versus **100%** with the real wiring. **[peer-reviewed]**
- What the model leaves out, by its own account: morphology, gap junctions, neuromodulation/neuropeptides, plasticity, nonzero baseline firing, receptor dynamics, and any body (it is open loop). Absolute firing rates are not trusted. **[peer-reviewed]**
- Code: [`philshiu/Drosophila_brain_model`](https://github.com/philshiu/Drosophila_brain_model) (MIT, Python/Jupyter, conda, about 10 min to install). Eon's [`eonsystemspbc/fly-brain`](https://github.com/eonsystemspbc/fly-brain) repackages the model as a **six-backend benchmark** (Brian2 CPU, Brian2CUDA, PyTorch, NEST GPU, GeNN, Brian2GeNN). It does **not** contain the body-coupling code. **[code/doc]**
- Eon's own 10 Mar 2026 research post confirms the reuse. The embodied fly is "a leaky integrate-and-fire (LIF) model" from Shiu et al., wired to NeuroMechFly through a "deliberately low-dimensional readout layer" whose mappings were "chosen by hand". **[company post]**
- Contrast: [Lappalainen et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11525180/) takes **wiring fixed from the connectome** and fits **734 free parameters by deep learning** on an optic-flow task. That is "connectome-constrained + trained", versus Shiu's "connectome-only, untrained". **[peer-reviewed]**

## 1. The Shiu et al. model: what it is

**Paper.** Shiu et al. (co-authors include Sterne and Bidaye; Kristin Scott lab), "A Drosophila computational brain model reveals sensorimotor processing", *Nature* 634:210-219. Received 26 Jul 2023, accepted 27 Jun 2024, published 2 Oct 2024. It is part of the FlyWire paper package ([PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)). **[peer-reviewed]**

**Neuron model** (Methods, PMC text). This is LIF with exponentially decaying synaptic conductance-like input:
- `dv/dt = (g - (v - V_rest)) / T_mbr`, `dg/dt = -g / tau`, and on a presynaptic spike `g += w_ji`.
- V_rest = V_reset = -52 mV. V_threshold = -45 mV. Refractory period 2.2 ms. Synaptic decay tau = 5 ms. Spike-to-input delay 1.8 ms. R_mbr = 10 kOhm cm^2 and C_mbr = 2 uF cm^-2, so T_mbr = 20 ms **(my calc)**.
- **The same parameters apply to every neuron.** The only free parameter is **W_syn = 0.275 mV**. It was calibrated so that 100 Hz sugar-neuron input gives about 80% of maximal MN9 firing.
- The paper text I read does not state the timestep. Eon's repo uses 0.1 ms for all backends ([README](https://github.com/eonsystemspbc/fly-brain)). **[code/doc]**

**How weights are set.** `w_ji = (FlyWire synapse count) x (+1 or -1) x W_syn`. The sign comes from Eckstein et al.'s machine-learning neurotransmitter predictions (cleft score >= 50, top prediction per presynaptic site). A neuron counts as **inhibitory if more than half its presynaptic sites are predicted GABA or glutamate**. Dopamine, octopamine and serotonin neurons are treated as *excitatory*. **[peer-reviewed]**

**Scale.** The paper used **127,400 proofread neurons from FlyWire materialization v630**. Press and Eon describe it with the full FlyWire figures of 139,255 neurons and about 50M synapses ([Berkeley news, 2 Oct 2024](https://vcresearch.berkeley.edu/news/researchers-simulate-fly-brain-laptop-human-brain-next)). The repo also supports the public v783 release. **[peer-reviewed]** / **[press]** / **[code/doc]**

**Inputs and protocol.**
- All neurons have **0 Hz baseline**.
- Activation means driving chosen neurons with Poisson spikes: sugar gustatory receptor neurons (GRNs) at 10-200 Hz, water GRNs at 20-260 Hz, Johnston's organ neurons (JONs) at 20-220 Hz.
- Silencing means zeroing all synapses to and from a neuron.
- Each experiment is **30 simulations of 1,000 ms**.
- This mimics optogenetic activation and silencing, so it is an in-silico perturbation screen. **[peer-reviewed]**

**Compute.** The paper says: "Simulation of sugar neuron activation takes approximately 5 min per 1,000 ms trial per central processing unit thread." **[peer-reviewed]** The Berkeley press release turns this into "can run on a laptop", without giving hardware. **[press]** For scale **(my calc)**: one stimulus condition (30 trials) is about 150 thread-minutes, or roughly 20 min wall-clock on an 8-thread laptop with ideal parallelism.

## 2. What it predicted and how it was checked

All items in this section are **[peer-reviewed]** unless marked.

- **Sugar to feeding (MN9 / proboscis extension).**
  - 45 neurons respond at 10 Hz sugar input and 455 at 200 Hz.
  - 47 neurons are sugar-responsive *and* sufficient to drive MN9. 14 of these are also *required*.
  - The model recovers all 10 previously known sugar-responsive cell types. It predicts 8 of them as sufficient, and 3 of the 5 required types as giving more than 20% MN9 drop when silenced.
  - Phantom was a false negative.
- **Water.** 39 neurons are sufficient for MN9, 30 of which are shared with sugar, and 9 are necessary and sufficient. 5 of 6 predicted silencing hits reduced water-evoked proboscis extension in flies. Usnea reduced it despite a "no effect" prediction.
- **Bitter / Ir94e.** The model predicts inhibition of feeding, confirmed behaviorally. Ir94e blocks the response to 50 mM sucrose but not to 1 M, while bitter blocks both.
- **Optogenetic split-GAL4 screen.** Of 106 cell types, the model predicted that 11 would activate MN9 at 50 Hz, and 10 of those did.
- **Antennal grooming.** Starting from 147 JONs, the model recovers the known grooming circuit (aBN1, aBN2, aDN1, aDN2). Calcium imaging confirmed the predicted asymmetry: JO-CE activates aBN1 and JO-F does not.
- **Headline accuracy.** The paper says: "Across 164 predictions we were able to test empirically, 91% were consistent with our empirical results." The figure is 84% without the split-GAL4 screen.
- **Controls and robustness.**
  - Weight-shuffled connectomes activate MN9 in 1/100 runs, versus 100% for the real wiring.
  - Changing W_syn by +/-30% gives 85-88% accuracy, and changing inhibition strength by 50% gives 88-89%.
  - Treating glutamate as excitatory erases the bitter/Ir94e inhibition results and raises optogenetic false positives from **1% to 16%**. In other words, getting the sign right matters more than getting the gain right.
- **Locomotion.** Berkeley press says co-author Salil Bidaye used the model to predict locomotion. I did not verify this in the paper text. **[press]**

## 3. Acknowledged simplifications and failure modes

From the paper's Discussion and Methods **[peer-reviewed]**, plus Shiu's comments in press **[press]**:
- **Point neurons:** no dendritic morphology and no channel diversity. Every excitatory neuron behaves identically, and so does every inhibitory one. Shiu calls this "not true" and the model "rather elementary" ([Berkeley](https://vcresearch.berkeley.edu/news/researchers-simulate-fly-brain-laptop-human-brain-next)).
- **No gap junctions.** They "cannot be identified in the electron microscopy dataset".
- **No neuromodulation**, neuropeptides, extrasynaptic signalling, or receptor dynamics. Neuromodulatory neurons are simply counted as excitatory.
- **No plasticity or learning.** The weights are frozen by construction.
- **Zero baseline firing**, so inhibition onto a silent neuron does nothing. The authors think this explains the Phantom and Tentacular misses.
- **Only relative rates are meaningful.** Absolute firing rates are "unlikely to be accurate".
- **Open loop, no body.** Input is hand-specified Poisson drive and output is spike counts. Nothing closes the loop through behavior. That gap is what Eon set out to fill.

## 4. The code, how hard it is to run, and ports

| Repo | What | Stack | Notes |
|---|---|---|---|
| [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) | Official model | Python, Brian2, conda (`environment.yml`), Jupyter (`example.ipynb`, `figures.ipynb`), `model.py` | MIT. Mac/Win/Linux, about 10 min install. Use Brian2's C++ codegen for speed. Colab works but is slow. Defaults to v630 data, v783 optional. Raw outputs are several GB, hosted on [Edmond](https://edmond.mpdl.mpg.de/dataset.xhtml?persistentId=doi:10.17617/3.CZODIW). About 378 stars. **[code/doc]** |
| [eonsystemspbc/fly-brain](https://github.com/eonsystemspbc/fly-brain) | Same LIF model, multi-backend benchmark | Brian2 C++ standalone, Brian2CUDA, PyTorch (sparse CSR, eager), NEST GPU (custom `user_m1` kernel, built from source), GeNN 5.4, Brian2GeNN | GPL-2.0-or-later, with Shiu code kept under MIT. Treats Brian2 CPU as "ground truth" and compares backends by Jaccard overlap and rate correlation. v783 data. Tested on an RTX 4070 under WSL2. Benchmarks are timestamped May 2026. About 991 stars. **No body code.** **[code/doc]** |
| [webgpu-fly demo](https://abgunaydin-webgpu-fly.static.hf.space/index.html) | LIF in a fused WebGPU kernel, FlyWire brain + MANC nerve cord + flybody | Browser | Independent teaching demo. 0.25 kHz biological time on an M2 Pro (NEST 0.67 kHz). Brain-to-cord link and tripod gait are hand-written. With the shortcut off, the fly "mostly pivots in place". **[code/doc]** |
| [migkapa/flyputer](https://github.com/migkapa/flyputer) | A local Gemma LLM calls tools that query FlyWire and run a small LIF sim | Python, no GPU | Hobby toy using a "Shiu-style sign convention". **Directly relevant to this hackathon: an LLM agent driving a connectome simulator.** **[code/doc]** |

**Speed data from Eon's benchmark CSV** ([`data/benchmark-results.csv`](https://github.com/eonsystemspbc/fly-brain), 720 runs, sugar GRNs at 200 Hz). The README does not define `realtime_ratio`. From the columns it equals `t_run x n_run / sim_time` **(my inference)**. Medians over 5 rounds for 1 trial of 100 s simulated, as **(my calc)** from the CSV:
- GeNN GPU: about **2.0x real time** (100 s in about 50 s).
- NEST GPU: about 1.0x.
- Brian2GeNN: about 0.52x.
- Brian2 CPU (C++ standalone, multicore): about 0.35x (100 s in about 286 s).
- Brian2CUDA: about 0.27x.
- PyTorch CUDA: about 0.10x.

The CPU model is not given. Brian2 CPU here runs about 100x faster than the paper's per-thread figure. Plausible reasons are C++ standalone mode, many cores, and newer hardware, but that is speculation. **No JAX port found.** (I searched, but this is a negative result, not proof none exists.)

## 5. Contrast: connectome-only vs. connectome-constrained + trained

**Lappalainen et al. 2024** ([Nature 634:1132-1140](https://pmc.ncbi.nlm.nih.gov/articles/PMC11525180/), online 11 Sep 2024; code: [TuragaLab/flyvis](https://github.com/TuragaLab/flyvis), PyTorch, MIT). **[peer-reviewed]** / **[code/doc]**
- **Scope:** optic lobe motion pathways only. 45,669 neurons, 1,513,231 connections, 64 cell types, 721 hexagonal columns.
- **Wiring source:** FlyEM FIB-25/FIB-19 local reconstructions, **tiled under a periodicity assumption**. It is *not* FlyWire.
- **Neurons:** passive, threshold-linear, **non-spiking**.
- **Fixed vs. trained:** connectivity, synapse counts and signs are fixed. Trained: "The only free parameters in our model are the single-neuron time constants and resting membrane potentials" plus one unitary strength per type-to-type connection, "just 734 free parameters".
- **Training:** backpropagation through time on optic-flow estimation from Sintel video, with a 50-model ensemble.
- **Validation:** compared against 26 published studies. It reproduces T4/T5 direction selectivity and ON/OFF preference for 32 cell types.
- **Key result:** in a toy setting, "sparsity in the connectome greatly improves the accuracy of neural activity predictions". Median correlation was 0.85 at 10% connectivity versus 0.38 at 80%.

**The distinction:**
- *Connectome-only, untrained* (Shiu): the structure *is* the model. One global gain sets the scale, and the predictions are "free" from wiring plus sign. That makes it falsifiable and cheap. But it cannot represent cell-type-specific dynamics, and it is weaker on recurrent, rhythmic or neuromodulated behavior.
- *Connectome-constrained + trained* (Lappalainen): the structure fixes *which* parameters exist and how they are shared. A task objective (and potentially recordings) fixes their *values*. It is more expressive, but it needs a task hypothesis and an ensemble to handle degeneracy.

**Other related models.**
- **Pospisil et al. 2024** ([Nature](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11446844/)) fits a *linear dynamical* "effectome", using the connectome as a prior together with optogenetic perturbations. It concludes that whole-brain dynamics come from many small circuits operating largely independently. **[peer-reviewed]**
- **Pugliese et al.** ("Connectome simulations identify a central pattern generator circuit for fly walking"; [bioRxiv](https://www.biorxiv.org/content/10.1101/2025.09.12.675944v1); first posted 12 Sep 2025 per the [Europe PMC record](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1101/2025.09.12.675944&resultType=core&format=json)) simulates the ventral nerve cord (VNC) connectomes. **[preprint]**
  - An in-silico descending-neuron screen ranks the walking command neuron DNg100 top.
  - Pruning isolates a **three-neuron rhythm generator** (one inhibitory, two excitatory) in four datasets.
  - It predicts that DNb08 drives rhythmic leg movement, which was confirmed with optogenetics.
  - Secondary coverage describes it as an untrained recurrent/rate model ([The Transmitter](https://www.thetransmitter.org/systems-neuroscience/long-sought-walking-circuit-found-in-fruit-flies/)). **I did not verify the model type from the methods.**
- **BANC brain-and-cord connectome** (Nature, reported 8 Jun 2026): "distributed control" rather than a few command neurons ([CASRAI summary](https://casrai.org/news/fruit-fly-connectome-no-central-command)). **[press about a peer-reviewed paper]** Hand-off to the connectome researcher.
- I have not yet found a peer-reviewed **brain+VNC spiking** whole-fly model. The webgpu demo is the closest public brain+cord+body stack, and it is explicitly unvalidated.

## 6. Does Eon reuse this model? (hand-off to the Eon researcher)

Yes, per Eon's own research post, ["How the Eon Team Produced a Virtual Embodied Fly"](https://eon.systems/updates/embodied-brain-emulation) (10 Mar 2026; team credited: Scott Harris, Aarav Sinha, Viktor Toth, Alexis Pomares, Philip Shiu). **[company post]**
- **Brain:** "a leaky integrate-and-fire (LIF) model built from the adult Drosophila central-brain connectome" (Shiu et al.). Signs come from Eckstein et al. The post does not name the simulator. The Register reports Brian2 ([16 Mar 2026](https://www.theregister.com/a/5224139)). **[press]**
- **Inputs:**
  - Taste GRNs are driven by contacts on the legs and proboscis.
  - "Virtual dust" drives the JONs.
  - Vision: Lappalainen-model activity is piped into matching LIF neurons, but "these activations are somewhat 'decorative'".
- **Outputs:** DNa01/DNa02 for steering, oDN1 for forward velocity, MN9 for feeding, antennal DNs for grooming. This is "a deliberately low-dimensional readout layer". "Many of the mappings between brain and body were chosen by hand rather than derived from the connectome."
- **Body:** NeuroMechFly, with walking controllers "trained to imitate the walking behavior of the fly". Hand-off to the body researcher: verify exactly which controller this is.
- **Coupling:** "We currently run the syncing steps between the brain and body every 15 ms."
- **Stated limits:** internal dynamics "not yet validated", "a small subset of sensory inputs", a sparse DN interface relative to more than 1,000 DNs, and plasticity/neuromodulation "largely missing".
- **People:** Philip Shiu is Eon's **Head of Engineering** ([eon.systems](https://eon.systems)). He is a co-author of the [State of Brain Emulation Report 2025](https://arxiv.org/abs/2510.15745) (arXiv, Oct 2025). I could not read that report: the PDF is too large to fetch.
- **Release status:** the embodiment code is unreleased per [The Decoder](https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/) (10 Mar 2026). **[press]**

## 7. Concepts that map onto agent systems (hand-off to the multi-agent researcher)

The mappings are my interpretation. Each rests on the cited result.
1. **Topology as program.** Shiu gets behavior-level predictions with zero training, because the *routing graph plus edge sign* carries the computation. The shuffled-graph control (100% vs 1/100) is a cheap test any agent team can borrow: randomize who-talks-to-whom and see whether performance collapses.
2. **Sparse fixed routing beats dense.** Lappalainen's sparsity result (0.85 vs 0.38 correlation) suggests sparse, typed connections are what make structure informative. For agents: explicit, sparse delegation edges rather than broadcast-to-all.
3. **Signs matter more than gains (E/I balance).** Flipping glutamate to excitatory raised false positives from 1% to 16%, while +/-30% gain barely moved accuracy. For agents: inhibitory or veto edges (critics, guards, budget limits) are load-bearing. Get their polarity right before tuning thresholds.
4. **Sensory to descending-command bottleneck.** About 140k neurons drive the body through a handful of DNs (Eon names DNa01, DNa02, oDN1, antennal DNs and MN9 but gives no count). For agents: a big internal team should emit a small, typed command vocabulary to actuators/tools.
5. **Perturbation screens as self-monitoring.** Activation/silencing sweeps find necessary vs. sufficient units, as in the 47-sufficient/14-required sugar analysis and Pugliese's pruning down to a three-neuron core. For agents: ablate agents or tools to find the minimal working core and the single points of failure.
6. **Silent-node blind spot.** With 0 Hz baseline, inhibition on an inactive neuron has no effect. For agents: monitors that only react to activity miss "nothing happened" failures, so add heartbeats or baseline activity.
7. **Distributed, mostly independent loops.** Pospisil's "many small circuits" and BANC's distributed control argue for local feedback loops with light coordination, not one central commander. That design also degrades more gracefully when a part fails.
8. **Control-loop tick.** Eon syncs brain and body every 15 ms and notes this "may be too slow for some behaviors". For agents: the planner-to-environment sync interval is a design parameter with behavioral consequences.

## Contradictions & open questions

1. **91% vs 95%.** The paper says 91% of 164 (84% excluding the split-GAL4 screen), and Eon's homepage also says 91%. "The First Multi-Behavior Brain Upload" announcement says "95% accuracy". I saw it only as reposted via The Innermost Loop Substack on [Human Progress](https://humanprogress.org/the-first-multi-behavior-brain-upload/). The title matches Eon's 7 Mar 2026 post, but I did not verify that Eon's own page says 95%. I could not find where 95% comes from.
2. **Compute.** The Register speculated that seconds of behavior "could have taken weeks or months". The paper gives about 5 min per simulated second per thread (open loop), and Eon's benchmark shows GPU backends at roughly real time. Closed-loop cost with 15 ms sync and a MuJoCo body is **unreported**, so the speculation is neither confirmed nor refuted for the embodied run.
3. **Eon's messaging is internally inconsistent.** The homepage says the fly "responds to light, navigates ... no hand-coded behaviors". Eon's own research post says the mappings were "chosen by hand" and vision is "decorative". (Hand-off to the Eon researcher.)
4. **Counts.** FlyWire/press give 139,255 neurons and about 50M synapses. The paper simulated 127,400 proofread neurons from v630. Eon's README says "~138k neurons, ~5M synapses", which is probably the number of connection-pair rows, not synapses (my guess; unverified). (Hand-off to the connectome researcher.)
5. **Expert critique.** Steve Furber (SpiNNaker) called it a "really good first step". He noted that the simulated brain "is not operating as a fly's brain does", with a 0 Hz resting state and simple drive ([The Register](https://www.theregister.com/a/5224139)). **[press]**
6. **Pugliese dates and type.** The DOI and Europe PMC say Sept 2025. The Transmitter describes an April 2026 preprint, possibly a revision. The model type (rate vs spiking) is not verified from the methods.
7. **Open questions.**
   - Does the embodied fly use v630 or v783 data, and are W_syn or other parameters re-tuned for closed loop?
   - Is any of the closed-loop behavior *caused* by connectome dynamics beyond the hand-picked DN-to-controller mapping? Eon says internal dynamics are not yet validated.
   - Berkeley says two other same-day Nature papers used the model. I did not identify which ones.

## Sources

- https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/ (Shiu et al., Nature 2024, full text)
- https://www.biorxiv.org/content/10.1101/2023.05.02.539144v1 (Shiu et al. preprint, May 2023)
- https://vcresearch.berkeley.edu/news/researchers-simulate-fly-brain-laptop-human-brain-next
- https://github.com/philshiu/Drosophila_brain_model
- https://edmond.mpdl.mpg.de/dataset.xhtml?persistentId=doi:10.17617/3.CZODIW
- https://github.com/eonsystemspbc/fly-brain (README and data/benchmark-results.csv)
- https://eon.systems
- https://eon.systems/updates/embodied-brain-emulation
- https://humanprogress.org/the-first-multi-behavior-brain-upload/
- https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/
- https://www.theregister.com/a/5224139
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11525180/ (Lappalainen et al., Nature 2024)
- https://github.com/TuragaLab/flyvis
- https://tuebingen.ai/news/researchers-combine-the-power-of-artificial-intelligence-and-the-wiring-diagram-of-a-brain-to-predict-brain-cell-activity
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11446844/ (Pospisil et al., Nature 2024)
- https://www.biorxiv.org/content/10.1101/2025.09.12.675944v1 (Pugliese et al. preprint)
- https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1101/2025.09.12.675944&resultType=core&format=json
- https://www.thetransmitter.org/systems-neuroscience/long-sought-walking-circuit-found-in-fruit-flies/
- https://casrai.org/news/fruit-fly-connectome-no-central-command
- https://abgunaydin-webgpu-fly.static.hf.space/index.html
- https://github.com/migkapa/flyputer
- https://arxiv.org/abs/2510.15745 (State of Brain Emulation Report 2025)
