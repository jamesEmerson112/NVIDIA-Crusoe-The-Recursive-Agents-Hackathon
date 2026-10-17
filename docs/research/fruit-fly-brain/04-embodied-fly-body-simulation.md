# 04 — The embodied fly: body models and the brain-body loop

*Researcher 4 of 5. Compiled 2026-10-17. Evidence labels: **[peer-reviewed]**, **[preprint]**, **[code/docs]**, **[company claim]**, **[press]**, **[inference]** (my own reasoning, not stated by a source). I did not install or run either package in this session.*

## TL;DR

- Two open-source MuJoCo fly bodies exist. **NeuroMechFly v2 / FlyGym** (EPFL, Ramdya lab; [Wang-Chen et al., *Nature Methods*, 12 Nov 2024](https://www.nature.com/articles/s41592-024-02497-y)) is built for **neuroscience coupling**. It has compound eyes, odor sensors, mechanosensory readouts, leg adhesion, CPG/rule-based/hybrid walking controllers, and an explicit "descending signal" interface. **flybody** (DeepMind + Janelia; [Vaxenburg et al., *Nature*, 23 Apr 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12310536/)) is built for **RL**. It has 102 DoF, a fluid model for flight, and deep-RL MLP policies that follow steering commands. **[peer-reviewed]**
- FlyGym was rewritten as **v2.x** (tag `v2.0.0` dated 2026-04-01; current `v2.1.0`, 2026-06-24). It needs Python 3.12–3.14, adds a MuJoCo Warp GPU backend, and can load the flybody skeleton experimentally. **[code/docs]**
- **How brains get coupled to bodies.** The published precedent is NMF v2 itself. Brain-level modules (including Lappalainen's connectome-constrained visual network) emit a **2-D descending signal** that modulates leg CPGs. That signal updates every **50 ms** in the tracking and odor tasks **[peer-reviewed]**. Physics steps at **1e-4 s** in current FlyGym **[code/docs]**. Ascending proprioception closes the loop **[peer-reviewed]**. Eon's demo is a variant of this pattern: a whole-brain LIF model, a sparse descending-neuron readout, and a 15 ms sync. **[company claim]**
- **The VNC gap.** Leg rhythm, interleg coordination and reflexes live largely in the ventral nerve cord (VNC; about 15k neurons), which a brain-only connectome omits. Something else has to stand in for it: a CPG, an imitation controller, or a learned decoder. That stand-in produces the gait. So "whole-brain emulation drives the body" really means *the brain selects and steers; an abstracted VNC executes*. A 2026 preprint even walked a fly body with a **worm** connectome plus RL. **[peer-reviewed + preprint + inference]**
- **At a hackathon:** FlyGym runs on this Mac on CPU (Python 3.13.2 is installed and qualifies). Use a Crusoe NVIDIA VM plus `flygym[warp]` for thousands of parallel worlds. flybody's core has a light dependency list (Python ≥3.10). Its training stack pins TF 2.8 and CUDA-11-era cuDNN. **[code/docs + local check]**

## 1. NeuroMechFly v1 → v2 and FlyGym

**v1** ([Lobato-Rios et al., *Nature Methods*, May 2022](https://www.nature.com/articles/s41592-022-01466-7)) built the body from an X-ray micro-CT scan of an adult female fly. Leg degrees of freedom came from 3D kinematics, including a previously unreported trochanter-femur DoF. Coupled oscillators drove tethered walking. **[peer-reviewed]** v2 states that v1 ran in PyBullet and that v2 moved to MuJoCo ([NMF v2 postprint](https://epfl.ch/labs/ramdya-lab/wp-content/uploads/2024/08/NMF2_postprint.pdf), p.3).

**v2** (Wang-Chen, Stimpfling, Lam, Özdil, Genoud, Hurtak, Ramdya; preprint Sep 2023, published 12 Nov 2024). I read the EPFL-hosted postprint. **[peer-reviewed]**
- **Framework:** the task is a POMDP behind the **Gymnasium** API. The observation is a configurable subset of vision, odor, contacts, joint angles/velocities/torques and fly pose. The action is target joint angles per actuated DoF plus a leg-adhesion on/off signal. Users can insert "sensory preprocessing" and "premotor computation" layers to shrink these spaces (Fig. 1c).
- **Body:** v2 refined the neck and front-leg coxa placement and split the antenna into pedicel, funiculus and arista with extra DoFs (useful for grooming readouts). Untethered step kinematics were re-recorded from three camera views. Meshes are scaled 1000× so outputs come in mm and mN.
- **Adhesion:** modeled as an injected normal force, switched on in stance and off in swing. Without adhesion the fly slipped at about 30° inclines. With adhesion it sometimes walked on slopes above 90° (Fig. 2c).
- **Vision:** each compound eye is a camera binned into **721 ommatidia** on a hexagonal grid, with about 270° combined field of view and about 17° binocular overlap. Ommatidia come in yellow and pale types mapped to the green/blue render channels.
- **Olfaction:** virtual odor sensors on the antennae and maxillary palps read user-defined odor fields.
- **Mechanosensation:** joint angles, actuator forces, contact forces and ground-contact flags are available. These drive the "ascending" demos below.
- **Locomotion controllers** (Fig. 2e; Methods). All three replay the *same recorded, segmented step*, so none is a learned policy:
  - **CPG:** one oscillator per leg, salamander-style coupled oscillators with phase biases that give a tripod gait.
  - **Rule-based:** Walknet-like rules 1–3 (swing inhibits swing, and so on). Decentralized.
  - **Hybrid:** CPG plus two local feedback rules ("overstretch" and "stumbling") that lift or extend a stuck leg. On gapped/blocks/mixed terrain the hybrid was fastest. Pure CPG was fast on flat ground but struggled on rugged ground. The rule-based controller was robust but slow (Fig. 2f).
- **Descending interface:** turning is driven by a **two-dimensional descending signal** DN = (left, right). |DN| sets oscillator amplitude and its sign sets direction (Methods, Eq. 1).
- **Ascending feedback:** for path integration, linear models use left−right stride differences to predict heading change (R² ≈ 0.96) and left+right stride sums to predict forward displacement (R² ≈ 0.98). Errors still accumulate, so the authors say external, for example visual, calibration may be crucial. An MLP maps 48-D joint-angle and contact input to neck roll/pitch for head stabilization (Fig. 4).
- **Hierarchical RL demo** (Fig. 5): a hexagonal CNN extracts object features from raw vision. An RL-trained MLP fuses those features with odor into a descending turning signal. That signal drives the hybrid CPG controller, and ascending signals stabilize the head. The fly avoids an obstacle and reaches an odor source over rugged terrain.
- **Connectome-constrained vision in closed loop** (Fig. 6): rendered ommatidia feed [Lappalainen et al.'s](https://doi.org/10.1038/s41586-024-07939-3) connectome-constrained optic-lobe network (64 cell types; **[peer-reviewed]**, *Nature* 2024). T1–T5, Tm and TmY activities drive object detection, which drives the descending turn signal, which drives the hybrid controller, so one fly can follow another. Head stabilization was needed on rugged terrain.
- **Not implemented in v2:** wings/flight, abdomen and proboscis control. The authors say the framework supports them (Discussion).

**FlyGym 2.x** ([repo](https://github.com/NeLy-EPFL/flygym), [docs](https://neuromechfly.org)) **[code/docs]**
- It is a full rewrite and not backward compatible. The old API now lives in `flygym-gymnasium`, and the paper's 13 tutorials use it.
- The README claims about 10× CPU speed-up (about 2× real-time) and about 300× on GPU via **MuJoCo Warp** (about 60× real-time aggregate). Hardware is unspecified.
- Current tutorials: scene composition, replaying recordings, GPU simulation, CPG/rule-based/hybrid/turning controllers, the **FlyBody model** (experimental), **muscle-based imitation learning** (Gymnasium + Stable-Baselines3), and profiling.
- Default physics timestep is **1e-4 s** for both the NMF and FlyBody skeletons, with an Euler integrator for NMF ([mujoco_globals.yaml](https://github.com/NeLy-EPFL/flygym/blob/main/src/flygym/assets/model/neuromechfly/mujoco_globals.yaml)).
- The GPU tutorial runs 100 to 1000 worlds that share one model. Physics time stays roughly flat from 100 to 1000 worlds. It also covers GPU batch rendering and CUDA-graph capture of the whole control loop ([tutorial 3](https://github.com/NeLy-EPFL/flygym/blob/main/tutorials/3_gpu_accelerated_simulation.ipynb)).

## 2. flybody (DeepMind + Janelia)

Vaxenburg, Siwanowicz, Merel, …, Card, Reiser, Botvinick, Branson, Tassa, Turaga. Preprint Mar 2024; *Nature* 643:1312–1320, online 23 Apr 2025, CC BY. **[peer-reviewed]** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12310536/), [repo](https://github.com/TuragaLab/flybody), [Janelia press release](https://janelia.org/news/artificial-intelligence-brings-a-virtual-fly-to-life))
- **Body:** built from confocal imaging of a dissected, cleared female fly and simplified in Blender. It has **67 rigid bodies, 66 joints and 102 DoF**, mass about 0.983 mg and length about 0.297 cm. Wings use torque actuators and other joints use position actuators. Tendons couple the abdomen and tarsi. Adhesion actuators on the tarsi and labrum were released as a general MuJoCo feature. Sensors cover vision (eye cameras), vestibular, proprioceptive and mechanosensory input. The authors warn that **position-actuator signals are not biologically meaningful**, and muscles are not modeled.
- **Physics:** a stateless, quasi-steady fluid model (drag, Kutta and Magnus lift, added mass) tuned until stable hovering was achieved, plus an adhesion model.
- **Controllers:** feedforward MLPs trained with **DMPO** (acme), with distributed CPU actors and a GPU learner on Ray.
  - **Flight:** 62 inputs → 12 outputs. The policy rides on a fixed **wingbeat pattern generator** at about 218 Hz (±10%), a CPG-like baseline the policy only perturbs. Training used *D. hydei* free-flight trajectories.
  - **Walking:** 286 inputs → 59 outputs, with no gait generator. It imitates about 16,000 snippets (about 80 min) of 3D-lifted walking keypoints while following high-level steering commands.
  - **Vision-guided flight:** a CNN on 32×32 eye images trains a **high-level navigator on top of a frozen, pretrained low-level flight controller** ("bumps" and "trench" tasks).
- **Timing:** flight uses 0.05 ms physics / 0.2 ms control, and walking uses 2 ms control steps. Simulating 10 ms took **421.5 ms (flight)** and **68.65 ms (walking)** on one CPU core, so a single fly is far slower than real time.
- **Data:** imaging stack, imitation datasets, wingbeat pattern and **trained controller networks** are on [Figshare](https://doi.org/10.25378/janelia.25309105). License is Apache-2.0. Last push to the repo was 2026-02-07.
- **Connectome:** the paper only points to future integration with connectome-constrained networks. It does not discuss descending neurons.

## 3. Coupling a brain model to a body

For a broader review of neuromechanical models from the NMF authors, see [Wang-Chen & Ramdya 2026](https://arxiv.org/abs/2601.08056) (*Curr. Opin. Neurobiol.*). I read only the abstract.

**The parts any brain-body loop needs** (the generic pattern is my synthesis **[inference]**; examples are cited):
1. **Sensory encoding.** Body sensor readings must become drive on specific sensory neurons. The Shiu LIF model takes **Poisson input at a set rate** (default 150 Hz) on chosen neurons ([model.py](https://github.com/philshiu/Drosophila_brain_model)) **[code/docs]**. Rendered ommatidia first need a retina/optic-lobe model, such as Lappalainen's, to become neuron activity.
2. **Neural integration.** The Shiu model runs in Brian2. Its `model.py` sets no `defaultclock.dt`, so Brian2's default applies. Its constants are τ_m = 20 ms, refractory 2.2 ms and synaptic delay 1.8 ms **[code/docs]**.
3. **Motor decoding.** Spikes must become actuator commands. There are three options:
   - (a) A **hand-mapped low-dimensional drive**, for example DN rates onto NMF's 2-D descending signal.
   - (b) A **learned decoder**, for example an MLP or RL policy from efferent neurons to joints.
   - (c) **Simulating the VNC connectome down to motor neurons**, plus a motor-neuron→muscle→joint model. Neither stock body has muscles. FlyGym 2's muscle tutorial is a step toward this.
4. **Feedback.** Proprioceptive and contact signals have to return as ascending or sensory neuron input. Otherwise the loop is open.
5. **Scheduling (co-simulation).** The integrator steps themselves are not the problem, since both sides can step at 0.1 ms. The real issue is the **sync interval** and throughput. NMF v2 updated its brain-level turning bias every **0.05 s** of simulated time (Methods). flybody's flight policy acts every **0.2 ms**. Eon syncs every **15 ms** ([Eon, 10 Mar 2026](https://eon.systems/updates/embodied-brain-emulation)) **[company claim]**.
   - With 1.8 ms per synaptic hop, a few-hop sensory→DN path fits inside one 15 ms window. The body always acts on commands at least one window old.
   - That latency is fine for steering and behavior selection. It is too coarse for wingbeat-level flight (about 4.6 ms per cycle at 218 Hz) or fast reflexes, which therefore have to live in the body-side controller **[inference]**.

**What has actually been done:**

| Work (date, status) | Brain side | Body | Brain→body interface | Loop |
|---|---|---|---|---|
| [Shiu et al.](https://www.nature.com/articles/s41586-024-07763-9) (*Nature* 2024, peer-reviewed) | Whole central-brain LIF (FlyWire) | none | read DN/MN spike rates | **open** |
| NMF v2 (2024, peer-reviewed) | FlyVis visual network + hand-designed or RL modules | NMF | 2-D descending signal → CPG/hybrid | closed |
| flybody (2025, peer-reviewed) | RL MLPs (no connectome) | flybody | steering commands → policy | closed |
| [Eon](https://eon.systems/updates/embodied-brain-emulation) (Mar 2026, company claim) | Shiu LIF + FlyVis-predicted vision | NMF v2 | hand-picked DNs/MN9 → imitation-trained NMF controllers; 15 ms sync | closed |
| [FlyGM](https://arxiv.org/abs/2602.17997) (Tsinghua, Feb–Jun 2026, preprint) | FlyWire graph as a message-passing controller | flybody | encoder → afferent neurons; efferent → **MLP decoder**; imitation then PPO | closed |
| [Digital sphinx](https://elifesciences.org/reviewed-preprints/111516) (Brunton, Abe, Hu, Tuthill, 2026, preprint) | ***C. elegans*** connectome | fly body (model unverified) | **deep-RL-trained** mapping to legs | closed |
| [Pugliese et al.](https://www.biorxiv.org/content/10.1101/2025.09.12.675944) (2025, preprint) | VNC connectome simulations | (body coupling unverified) | DN activation → rhythmic leg motor-neuron output | n/a |

**Handoff to the Eon researcher ([01](01-eon-systems-emulation.md) has the DN names, 15 ms and no-VNC details, so I don't repeat them).** To build its demo, Eon had to solve the following:
- Choose sensory neuron sets and rate codes for gustatory, mechanosensory and visual events.
- Run FlyVis-style vision inside NMF and inject the predicted activity into matching LIF neurons. NMF v2 Fig. 6 had already published the FlyVis↔NMF half of this.
- Pick a readout window and a gain to turn DN spike counts into controller commands. The exact mapping is undisclosed. Mapping DNa01/DNa02 onto NMF's left/right descending signal and oDN1 onto drive is my guess **[inference]**.
- Pick a sync interval (15 ms).
- Supply everything the VNC normally does.

On 01's two questions:
1. **"Imitation-trained NMF controllers."** The *published* v2 controllers are CPG/rule/hybrid replaying a recorded step, not learned policies. FlyGym 2.x separately ships a muscle-based imitation-learning tutorial. Which one Eon modified is not disclosed. The Transmitter's "deep RL" claim conflicts with Eon's "imitation" wording.
2. **"Why not flybody?"** Eon doesn't say. Grounded differences favor NMF **[inference]**: ready-made ommatidia (the FlyVis pipeline already demonstrated), odor sensors, segmented antennae for grooming, and an existing 2-D descending interface. flybody's trained stack is TF 2.8/acme RL policies. They accept high-level steering commands but have no ready-made descending-neuron mapping or odor sensors.

## 4. The ventral nerve cord gap

- **Anatomy.** NMF v2 gives the fly's VNC as about **15,000 neurons**. The female VNC connectome (FANC; [Azevedo et al., *Nature* 2024](https://doi.org/10.1038/s41586-024-07389-x)) reports about 14,600 cell bodies and about 45M synapses **[peer-reviewed]**. Male (MANC) DN→motor circuit analyses are in [eLife 96084](https://elifesciences.org/articles/96084) (2024) **[peer-reviewed]**. **BANC** ([Bates et al., *Nature* 2026](https://doi.org/10.1038/s41586-026-10735-w); [repo](https://github.com/htem/BANC-project)) is the first brain plus nerve cord connectome from one animal. Its README gives about 188,000 neurons and 199M predicted synapses **[code/docs]**. Its paper text, which I saw only via a search snippet, cites about 1,300 DNs and about 1,800 ascending neurons linking brain and cord.
- **Leg motor neurons are in the VNC.** FlyGM notes that FlyWire's "motor" classes hold only 106 neurons **[preprint]**. That is why Eon can read proboscis MN9 directly but must go through DNs and a stand-in controller for legs **[inference]**.
- **Rhythm is generated in the cord.** Pugliese et al. simulated VNC connectomes and found that the walking command neuron DNg100 drives rhythmic leg output through a minimal putative **three-interneuron CPG** in four datasets **[preprint, abstract-level]**.
- **DNs are not single "joystick" wires.** Command-like DNs recruit broader DN networks, and DNs with many downstream partners need that co-activation to drive full behaviors ([Braun et al., *Nature* 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11186778/)) **[peer-reviewed]**. BANC coverage stresses distributed control with substantial local VNC processing **[press]**. A hand-picked readout of a few DNs is therefore a strong simplification **[inference]**.
- **Implication.** In any current brain-only demo, gait, interleg coordination and recovery reflexes come from the VNC substitute. In NMF, that is the CPG plus hybrid rules. The brain contributes behavior selection and steering. The evidence for brain fidelity therefore has to come from the sensory→DN mapping, such as Shiu's validated sugar→MN9 and grooming circuits, not from how fly-like the walking looks.
  - The digital sphinx makes the point concrete: with an RL-learned adapter, a worm connectome walks a fly body. [Turaga told The Transmitter](https://www.thetransmitter.org/systems-neuroscience/digital-sphinx-raises-questions-about-connectome-models/) that a random network could also produce a walking fly **[press]**.
  - Eon itself calls its controller "a deliberately low-dimensional readout layer" and lists a VNC model as future work **[company claim]**.

## 5. Practical: running these at a hackathon

| | FlyGym 2.1.0 | flybody 0.1.0 |
|---|---|---|
| Python | `>=3.12,<3.15` ([pyproject](https://github.com/NeLy-EPFL/flygym/blob/main/pyproject.toml)) | `>=3.10`; README uses a conda env with `python=3.10` and `cudatoolkit=11.8.0` |
| Core deps | `mujoco>=3.9,<3.10`, numpy 2.x | `dm_control`, **`numpy==1.26.4`** pinned |
| Install | `pip install "flygym[examples]"`; add `warp` (NVIDIA only) and `rl` as needed; or Docker `nelyepfl/flygym`; or Colab (up to about 50× slower) | `pip install -e .` (model + tasks); `.[tf]` adds TF 2.8.0, dm-acme, dm-reverb 0.7.0, cuDNN cu11 8.9; `.[ray]` adds distributed training |
| GPU | optional; `warp-lang 1.14` + `mujoco_warp 3.9` for batched worlds | not needed for the model; the training stack expects CUDA 11-era libs |
| Headless | `MUJOCO_GL=egl`, `PYOPENGL_PLATFORM=egl` (may need `libegl1-mesa-dev`) | `MUJOCO_GL=egl`, `MUJOCO_EGL_DEVICE_ID=0` |
| First run | tutorials 4a–4d (CPG → hybrid → turning) | `docs/getting-started.ipynb` (Colab badge in README) |

**Local check (this Mac):**
- Python 3.13.2 at `/opt/homebrew/bin/python3`, plus `python3.10`, `uv` 0.12.19 and conda 26.1.1.
- The machine is arm64, so there is no NVIDIA GPU and the `warp` extra is not usable here.
- Suggested quick path: `uv venv -p 3.13 && uv pip install "flygym[examples]"`, then run tutorial 4d.
- For GPU fan-out, use a Crusoe NVIDIA VM with `flygym[warp,examples,rl]` and the EGL variables set.
- To use the DeepMind skeleton through FlyGym's API, see tutorial 5b, which drives it with the same hybrid turning controller. It is marked experimental. **[code/docs]**

## 6. Concepts that map to agent teams

- **Hierarchy with a narrow command channel.** The brain or planner sends a *2-D* descending signal. The VNC/CPG layer turns it into 42 joint targets plus 6 adhesion bits (NMF; FlyGym 5b). This mirrors [Merel, Botvinick & Wayne 2019](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6889345/) on hierarchical motor control in mammals and machines **[peer-reviewed]**. For agents: give the orchestrator a small, typed intent API and let workers own the details.
- **CPGs as autonomous sub-loops.** CPGs produce rhythm without rhythmic input, and descending drive only modulates their amplitude and frequency ([Ijspeert 2008](https://doi.org/10.1016/j.neunet.2008.03.014); NMF v2 Methods). flybody's wingbeat generator is the same idea. For agents: long-running workers that keep their own cadence, with the manager tuning parameters rather than issuing every step.
- **Local recovery before escalation.** The hybrid controller's stumble/overstretch rules beat the pure CPG on rugged terrain without involving the brain (NMF v2 Fig. 2f). This maps directly onto the hackathon's "recover" theme: let workers self-heal using local reflexes and escalate only on repeated failure.
- **Ascending summaries and the need for external calibration.** Stride-based path integration was highly accurate per step (R² ≈ 0.96) but still drifted. The authors argue for visual recalibration. For agents: self-reported progress drifts, so periodically check it against ground truth such as tests, external state or a verifier agent.
- **Freeze and reuse skills.** flybody trained only a new navigator on top of a frozen flight controller. For agents: reuse proven sub-agents and tools, and iterate on the top layer.
- **Multi-rate scheduling.** The physics runs at 0.1 ms, the brain modules at 15–50 ms, and the planner at seconds. Choose the sync interval deliberately, and remember that commands are always at least one interval stale.
- **Run a random-planner control.** The digital-sphinx lesson: if the adapter is learned, a bad planner can look competent. Evaluate the top layer with ablations or a random baseline. (Handoff to researcher 05.)

## Contradictions & open questions

- **FlyGym 2.0 release date:** the README says March 2026 and the site says April 2026. The git tag `v2.0.0` is dated 2026-04-01, which is the date used here.
- **"87 joints":** this figure comes from Eon's post describing NMF. I did not verify a total joint count in the NMF v1 or v2 text I read.
- **Which NMF controller Eon modified, and whether RL was used:** Eon says "trained to imitate"; The Transmitter says deep RL. The published v2 controllers are neither.
- **BANC numbers:** the README says about 188k neurons and 199M synapses. Press reports say 158k neurons, and 3M or 40M synapses. The DN/AN counts (about 1,300 / 1,800) come from a snippet I did not read in context.
- **Speed claims** (2× and 60× real time) have no stated hardware. flybody's per-core numbers suggest that single-fly CPU simulation is slower than real time.
- **Unverified preprint details:** the Pugliese and digital-sphinx coupling details (body model used, and whether VNC output drove a body) were seen only at abstract or press level.
- **Is a 15 ms sync adequate?** Eon itself says it "may be too slow for some behaviors". Nobody has published a sync-interval ablation for brain-body fly loops that I could find.

## Sources

- https://www.nature.com/articles/s41592-024-02497-y
- https://epfl.ch/labs/ramdya-lab/wp-content/uploads/2024/08/NMF2_postprint.pdf
- https://www.biorxiv.org/content/10.1101/2023.09.18.556649.full.pdf
- https://www.nature.com/articles/s41592-022-01466-7
- https://neuromechfly.org
- https://neuromechfly.org/installation/
- https://github.com/NeLy-EPFL/flygym
- https://github.com/NeLy-EPFL/flygym/blob/main/pyproject.toml
- https://github.com/NeLy-EPFL/flygym/blob/main/tutorials/3_gpu_accelerated_simulation.ipynb
- https://github.com/NeLy-EPFL/flygym/blob/main/tutorials/5b_using_flybody_model.ipynb
- https://github.com/NeLy-EPFL/flygym/blob/main/src/flygym/assets/model/neuromechfly/mujoco_globals.yaml
- https://github.com/google-deepmind/mujoco_warp
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12310536/
- https://www.nature.com/articles/s41586-025-09029-4
- https://www.biorxiv.org/content/10.1101/2024.03.11.584515v1.full.pdf
- https://github.com/TuragaLab/flybody
- https://github.com/TuragaLab/flybody/blob/main/pyproject.toml
- https://doi.org/10.25378/janelia.25309105
- https://janelia.org/news/artificial-intelligence-brings-a-virtual-fly-to-life
- https://www.nature.com/articles/s41586-024-07763-9
- https://github.com/philshiu/Drosophila_brain_model
- https://doi.org/10.1038/s41586-024-07939-3
- https://eon.systems/updates/embodied-brain-emulation
- https://preservinghope.substack.com/p/no-we-havent-uploaded-a-fly-yet
- https://www.thetransmitter.org/systems-neuroscience/digital-sphinx-raises-questions-about-connectome-models/
- https://elifesciences.org/reviewed-preprints/111516 (pointer only; page did not load for me; details via The Transmitter and search snippets)
- https://arxiv.org/abs/2602.17997
- https://www.biorxiv.org/content/10.1101/2025.09.12.675944
- https://doi.org/10.1038/s41586-026-10735-w
- https://github.com/htem/BANC-project
- https://faculty.washington.edu/tuthill/docs/banc2026.pdf (not retrieved; DN/AN counts cited via search snippet of this PDF)
- https://elifesciences.org/articles/96084
- https://doi.org/10.1038/s41586-024-07389-x
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11186778/
- https://arxiv.org/abs/2601.08056
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6889345/
- https://doi.org/10.1016/j.neunet.2008.03.014
