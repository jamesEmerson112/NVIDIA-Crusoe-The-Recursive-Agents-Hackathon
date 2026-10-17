# 01: Eon Systems' "digital fruit fly" emulation claim

_Researched 2026-10-17. Evidence labels: **[peer-reviewed]**, **[preprint]**, **[company claim]**, **[press report]**, **[repo data]** (read directly from a public GitHub repo), **[inference]** (my own reasoning)._

## TL;DR

- **What was announced.** On **7 March 2026**, Alex Wissner-Gross posted a video and essay, "The First Multi-Behavior Brain Upload," on X and Substack. It showed a simulated fruit fly walking to food, feeding, and grooming its antennae, driven by a connectome-based brain model. CEO Michael Andregg followed on 8 March with an X thread titled "We've uploaded a fruit fly." The technical write-up came on 10 March. ([WG X article](https://x.com/alexwg/status/2030217301929132323), [Substack](https://theinnermostloop.substack.com/p/the-first-multi-behavior-brain-upload), [Andregg](https://x.com/michaelandregg/status/2030764512488677736), [Eon tech post](https://eon.systems/updates/embodied-brain-emulation)) **[company claim]**
- **How it was built.** Eon combined published parts:
  - the Shiu et al. 2024 leaky integrate-and-fire (LIF) whole-brain model in Brian2, built on the FlyWire connectome;
  - the Lappalainen et al. visual network, whose output Eon itself calls "somewhat 'decorative'";
  - the NeuroMechFly v2 body model in MuJoCo.

  A handful of hand-picked descending neurons (the brain's output cells) steer NeuroMechFly controllers that were pre-trained by imitation learning. Brain and body exchange data every 15 ms. **[company claim]**
- **The brain chooses; the body executes.** Eon writes that the behaviors "lean heavily on the body model's existing controllers" and that "many of the mappings between brain and body were chosen by hand." No ventral nerve cord (VNC, the fly's spinal cord) is simulated. There is no plasticity, and internal dynamics have not been validated. **[company claim]**
- **What is missing:**
  - no peer-reviewed paper or preprint for the embodied demo;
  - no released embodiment code;
  - no quantitative behavioral validation;
  - no compute or real-time numbers for the closed loop.

  The brain-only simulator code is public: [eonsystemspbc/fly-brain](https://github.com/eonsystemspbc/fly-brain), GPL-2.0. **[repo data]**
- **Expert reaction was largely critical:**
  - Ken Hayworth (Janelia) called the video "misleading."
  - Alexander Bates (Harvard) called it "gross misrepresentation."
  - The Verge ran a skeptical piece, which I could only read secondhand.
  - Brunton's lab posted a "digital sphinx" preprint showing that a *worm* connectome trained with deep reinforcement learning (RL) can also walk a fly body.
  - Eon's own Philip Shiu later said it is "not a full blown copy of a fly."

  ([Hayworth](https://x.com/KennethHayworth/status/2032604687212392562), [Transmitter](https://www.thetransmitter.org/systems-neuroscience/digital-sphinx-raises-questions-about-connectome-models/))
- **Why the neuron counts differ.** "~125,000" comes from the Shiu *Nature* abstract ("more than 125,000"). The model itself ran 127,400 neurons from FlyWire v630. "139,255" is the final FlyWire v783 count (Dorkenwald et al. 2024), and Eon's homepage uses it.

## 1. Timeline and channels

All times are UTC, decoded from X post IDs.

| Date | Event | Label |
|---|---|---|
| 30 Dec 2025 | Untapped Ventures announces a $3.5M seed round led by Protocol Labs. It says Eon targets complete mouse-brain emulation within two years (paraphrased from a page summary, not a verbatim quote). ([Untapped](https://untappedventures.substack.com/p/untapped-ventures-invests-in-eon)) | company/investor claim |
| 5 Mar 2026 | `eonsystemspbc/fly-brain` repo created (brain-only, multi-backend). ([GitHub API](https://github.com/eonsystemspbc/fly-brain)) | repo data |
| 7 Mar 09:41 | Wissner-Gross posts an X article with the video, mirrored on his Substack *The Innermost Loop*. He discloses "a financial interest in Eon." | company claim |
| 8 Mar 16:55 | Elon Musk reacts on X; Eon's media page lists this. ([Eon updates](https://eon.systems/updates)) | — |
| 8 Mar 21:56 | Andregg's thread "We've uploaded a fruit fly," reposted as an Eon update ([page](https://eon.systems/updates/weve-uploaded-a-fruit-fly)). | company claim |
| 9 Mar | Eon says "Fly Brain Upload" trended on X. Wissner-Gross appears on the TBPN podcast on 9–10 Mar. | company claim |
| 10 Mar | Eon technical post, "How the Eon Team Produced a Virtual Embodied Fly." It credits Scott Harris, Aarav Sinha, Viktor Tóth, Alexis Pomares, and Philip Shiu. | company claim |
| 10–16 Mar | Coverage from Decoder, Cointelegraph, Futurism, The Register, Forklog, and The Verge, plus critiques from Januszewski, Bates, and Hayworth. | press / social |
| ~20 Mar | Brunton lab "digital sphinx" preprint ([bioRxiv DOI](https://doi.org/10.64898/2026.03.20.713233)). | preprint |
| 2 Apr | *The Transmitter* article quoting Shiu's walk-back. | press report |
| 11 Sep 2026 | Eon perspective, "More flies are getting 'uploaded'," about community hacks (Doom, Minecraft, Mario) built on fly connectomes. ([Eon](https://eon.systems/updates/more-flies-are-getting-uploaded)) | company claim |

**Who is behind it.** Eon Systems PBC is a public-benefit corporation in San Francisco. Its mission line is "Brain emulation so humans can flourish in a world with superintelligence." **[company claim]** ([eon.systems](https://eon.systems/))

- **Leadership:** Michael Andregg (Founder & CEO), Philip Shiu (Head of Engineering, first author of the 2024 *Nature* model), and Aurelia Song (CSO per Untapped; listed as "Founding Advisor" on the site).
- **Advisors:** David Eagleman, George Church, Konrad Körding, Stephen Wolfram, Anders Sandberg, Robin Hanson, Stephen Larson, and others.
- **Wissner-Gross's role is labeled inconsistently.** Press calls him "co-founder." Eon's team page lists him as "Founding Advisor." Eon's tech post calls him "co-founder and founding advisor." He himself writes "a company I helped found."
- **Funding:** $3.5M seed, led by Protocol Labs, with Untapped Ventures participating. Seedtable and press summaries also name Larry Page's family office ([Seedtable](https://seedtable.com/companies/eon-systems/funding-rounds/seed-2025-12)); I did not see that in the Untapped post itself. **[press report]**

## 2. What is technically described

The source for everything in this section is Eon's 10 March post. **[company claim]**

| Layer | What Eon used |
|---|---|
| Connectome | FlyWire adult female *Drosophila* brain. The post says "approximately 140,000 neurons and roughly 50 million synaptic connections," with synapse signs taken from predicted neurotransmitters (Eckstein et al. 2024). |
| Neuron model | The Shiu et al. LIF model: point neurons, no dendrites, no plasticity, no neuromodulation, no gap junctions. In the paper it runs in **Brian2**. ([Shiu 2024, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)) **[peer-reviewed]** |
| Vision | The Lappalainen et al. connectome-constrained network of 64 visual cell types. Its activity is "piped in" to the LIF model but is "somewhat 'decorative' in that [it does] not currently substantially influence our behavioral outputs." |
| Body | **NeuroMechFly v2** (Wang-Chen et al. 2024, *Nature Methods*): 87 joints, a mesh from X-ray micro-CT, with built-in vision and olfaction. It runs in **MuJoCo**. Eon explicitly did *not* use the DeepMind/Janelia *flybody* model (Vaxenburg et al. 2025), even though the company's GitHub has a `flybody` repo described as "MuJoCo fruit fly body model and locomotion RL tasks." |
| Locomotion | "slight modifications to existing NeuroMechFly controllers, trained to imitate the walking behavior of the fly" (imitation learning). |
| Sensory in | Taste: gustatory receptor neurons for sugar or bitter, on the legs and proboscis. Grooming: "virtual dust" activates antennal mechanosensory neurons. Olfaction is possible via olfactory receptor neurons. |
| Motor out | A sparse readout from descending neurons (DNs) and motor neurons: **DNa01/DNa02** for steering, **oDN1** for forward speed, proboscis motor neuron **MN9** for feeding, and antennal DNs for grooming. Eon: "These mappings can be somewhat arbitrarily chosen by hand (as is our case)." |
| Loop | Brain and body sync every **15 ms**. Eon: "this 15 ms time step may be too slow for some behaviors." |
| Missing (per Eon) | No VNC; escape and backward walking not embodied; no internal state, learning, or hormones; internal dynamics not checked against signatures such as the head-direction ring attractor or central pattern generators. |

**Compute and real time.** Eon has not disclosed either for the embodied loop. Some reference points:

- **Brain-only, peer-reviewed:** the Shiu paper reports "approximately 5 min per 1,000 ms trial per central processing unit thread." That is about 300× slower than real time on one CPU thread. **[peer-reviewed]**
- **Brain-only, Eon's own benchmarks:** the repo's no-I/O timings for a 200 Hz sugar-neuron stimulus with one trial show:

  | Backend | Speed vs. real time |
  |---|---|
  | GeNN (GPU) | ~1.8–2.0× faster |
  | NEST GPU | ~0.8× |
  | Brian2 C++ (CPU) | ~0.35× |
  | PyTorch CUDA | ~0.15× |

  The README says it was "tested on RTX 4070," but the CSV does not record the GPU for each row. **[repo data]**
- **What this implies:** The Register guessed that seconds of behavior took "weeks or months." That is probably too pessimistic for the brain part. The cost of the body, the vision model, and the 15 ms loop is unknown. **[inference]**

## 3. Behaviors shown and how much is emergent

- **Shown in the video:**
  - walking and steering toward a banana slice using taste cues;
  - proboscis extension and feeding ("drinks from a small dish");
  - stopping to groom when dust builds up on the antennae.

  ([Eon](https://eon.systems/updates/embodied-brain-emulation), [Register](https://www.theregister.com/a/5224139), [Futurism](https://futurism.com/science-energy/research-fly-brain-matrix)) **[company claim]**
- **Not shown:** flight, escape, backward walking, learning, and courtship. Eon says looming-related neurons activate escape DNs in the *unembodied* model only.
- **Scripted vs. emergent.** The connectome model does produce the sensory-to-DN mapping: sugar gustatory neurons lead to MN9, and antennal mechanosensors lead to grooming DNs. The Shiu paper validated those two circuits **[peer-reviewed]**. But:
  - the gain from DN firing to body command was hand-set;
  - stepping, gait, and leg coordination come from pre-trained NeuroMechFly controllers;
  - there is no VNC.

  In Eon's own analogy, DNs are "control handles," like knowing the steering wheel and pedals "without explicitly simulating every combustion event inside the engine." **[company claim]**
- **The sharpest critiques of this setup:**
  - Alexander Bates (Harvard) asked whether behavior is effectively "descending neuron X on, play animation" ([X, 9 Mar](https://x.com/as_bates/status/2031064465337155774)).
  - Ariel Zeleznikow-Johnston argued that a simple rule-based script could produce much the same video, so the video cannot show the brain is doing the work ([LessWrong, 19 Mar](https://www.lesswrong.com/posts/ybwcxBRrsKavJB9Wz/no-we-haven-t-uploaded-a-fly-yet)).
- **Eon's own caveat:** the results "should not yet be interpreted as a proof that structure alone is sufficient to recover the entire behavioral repertoire."

## 4. The neuron-count discrepancy: ~125,000 vs 139,255 (and others)

| Number | Actual source | What it refers to |
|---|---|---|
| "more than 125,000" | Abstract of Shiu et al. 2024 *Nature*, repeated verbatim by Wissner-Gross, Decoder, Register, Forklog, and Futurism | A rounded description of the FlyWire central-brain connectome when the paper was written (bioRxiv May 2023). **[peer-reviewed]** |
| 127,400 | Shiu Methods: "All 127,400 proofread neurons from Flywire materialization v.630 are included in the model." | The neurons actually simulated in the paper; the v630 file in Eon's repo has 127,400 rows. **[peer-reviewed]** / **[repo data]** |
| 139,255 | Dorkenwald et al. 2024 *Nature*, the FlyWire flagship paper (v783 public release) | The final proofread whole-brain count, about 5×10⁷ chemical synapses. Eon's homepage uses it ("139,255 biological neurons"), and so do Gadget Review and Yahoo. **[peer-reviewed]** / **[company claim]** |
| "~140,000" | Eon tech post (citing Schlegel et al. 2024) | A rounded v783-era count. **[company claim]** |
| 138,639 | `data/2025_Completeness_783.csv` in `eonsystemspbc/fly-brain` | The v783 neuron list the public code actually loads. The README says "~138k neurons, ~5M synapses"; the 5M conflicts with 50M and is probably edges or a typo (unverified). **[repo data]** |

**Bottom line.** Outlets quoting "125,000" copied the 2024 abstract. Outlets quoting "139,255" copied Eon's homepage or FlyWire. Neither number states which snapshot drove the embodied demo, and **Eon has not said whether the demo used v630 or v783** **[inference]**.

**The accuracy figures are similarly muddled:**

- **91%** in Shiu et al. means that 91% of 164 experimentally testable predictions were consistent with experiments. Excluding the split-GAL4 optogenetic screen, it is 84%. **[peer-reviewed]**
- **"95% accuracy,"** used by Wissner-Gross and much of the press, does not appear as a model-accuracy figure in the paper. There, 95% is how often *perturbed* models (W_syn +30%, weaker inhibition) agreed with the default model.
- Andregg's "91% behavior accuracy" is a property of the disembodied 2024 model, not of the embodied fly.

## 5. Expert reactions and critiques

- **Steve Furber** (ARM co-designer, SpiNNaker), quoted in [The Register](https://www.theregister.com/a/5224139) on 16 Mar:
  - "pretty impressive" and "a really good first step";
  - but also: "The simulated brain is not operating as a fly's brain does. It's machine learning, clamped into the shape of a fly connectome, that has a resting state of 0 Hz… being zapped with simple inputs, not virtual sensory data."
  - The 0 Hz point is accurate: Shiu et al. state "The baseline firing of each neuron in our model is 0 Hz," a deliberate simplification. **[press report]**
- **Ken Hayworth** (Janelia; President of the Brain Preservation Foundation, so a pro-uploading critic), 13 Mar ([X](https://x.com/KennethHayworth/status/2032604687212392562)):
  - "misleading EON Systems 'fly upload' video";
  - "True uploading, even for a fruit fly, is likely years to decades away. Even obtaining a mouse connectome seems likely to be a decade or more away."
  - He also accused Eon of trying to raise money "from naive investors."
- **Alexander Bates** (Harvard Medical School): asked about ring-attractor dynamics and the missing "spinal cord," and later called it "gross misrepresentation" ([X](https://x.com/as_bates/status/2032846894301339769)).
- **Michał Januszewski** (Google connectomics): "Extraordinary claims require extraordinary evidence, not just cool visuals." ([X](https://x.com/michalj/status/2031400471655506352))
- **The Verge** ([link](https://www.theverge.com/ai-artificial-intelligence/894587/fly-brain-computer-upload), by Robert Hart). *I could not fetch it; these quotes come secondhand via [Mezha](https://mezha.ua/en/news/this-is-not-a-fly-309516/):*
  - Bakhtiari (U. Montréal): the blog post came "a little too late" and is "insufficient to fully verify the claims."
  - Bates: "the fly doesn't fly."
  - Nayebi (CMU): "didn't even come close."
  - The philosophers Birch (LSE) and McClelland (Cambridge) objected to the word "uploading."
  - Andregg: "I don't think of uploading as a binary concept." **[press report, secondhand]**
- **The Transmitter, "digital sphinx"** ([2 Apr](https://www.thetransmitter.org/systems-neuroscience/digital-sphinx-raises-questions-about-connectome-models/)):
  - Brunton and Tuthill (UW) wired a ~300-neuron *C. elegans* connectome to a fly body and trained it with deep RL to walk. The point is that a realistic-looking walk is weak evidence for connectome fidelity. **[preprint]**
  - Cowley (CSHL) asked whether a "randomly connected connectome" could do the same.
  - Turaga (Janelia) made a similar point.
  - **Shiu (Eon):** "I think it's fair to say that this is not a full blown copy of a fly," and suggested "a digital twin or an embodied model."
- **Eon's reply.** The tech post (dated 10 Mar) now includes a section that acknowledges "the thoughtful criticism," which suggests it was edited after publication (unverified). It concedes the hand mappings and the lack of validation, yet still answers "Is this an upload? In our minds, yes," calling it "the first embodied fly upload."

## 6. Next steps and the "whole-brain emulation" framing

- **Mouse target.** About 70M neurons, "560 times the fly's count." Eon plans to use expansion microscopy plus "tens of thousands of hours of calcium and voltage imaging," then go on to humans; Wissner-Gross: "the question for the mouse becomes one of scale, not of kind." **[company claim]**
  - The **"within two years"** timeline appears in Untapped's December 2025 post and in [The Decoder](https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/). It is *not* in Wissner-Gross's March essay.
  - Hayworth's estimate, a decade or more just for a mouse connectome, is the main counterpoint.
- **Fly next steps** in Eon's 10 March post: more sensory inputs and DNs, a VNC model, and a published "fidelity framework." As of the 11 Sep perspective, no named framework had been published; Eon says only that "The right standard is validation." **[company claim]**
- **Historical framing.**
  - Whole-brain emulation (WBE) as a program goes back to Sandberg & Bostrom's *Whole Brain Emulation: A Roadmap* (FHI Technical Report, 2008). Sandberg is now an Eon advisor. I did not verify a live URL; FHI closed in 2024.
  - Wissner-Gross positions the fly against OpenWorm (*C. elegans*, 302 neurons) and DeepMind/Janelia's RL-driven *flybody*.
  - The Eon post itself concedes that the first fly "upload," in its sense, was the unembodied Shiu model.

## 7. Is any code, weights, or data public?

- **[eonsystemspbc/fly-brain](https://github.com/eonsystemspbc/fly-brain)** (GPL-2.0, created 5 Mar 2026, last push 29 Aug 2026, ~990 stars):
  - **Contents:** the Shiu LIF brain re-implemented in six backends (Brian2 CPU, Brian2CUDA, PyTorch, NEST GPU, GeNN, Brian2GeNN), with FlyWire v783 and v630 data and a spike-output parity harness.
  - **No body, MuJoCo, NeuroMechFly, DN-mapping, or closed-loop code.**
  - Run labels such as `nature_2026_07` and a "Publication Dataset" README suggest a benchmarking paper in preparation **[inference]**.
- **[philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model)** (MIT): the original 2024 paper code.
- **Released data beyond connectome tables:** the full `nature_2026_07` spike-output bundle (600 parquet files) is hosted on Google Drive, per the README. **[repo data]**
- **Other Eon repos:** a `flybody` repo matching DeepMind's body model (not used in the demo, per Eon) and `pathintegrationBPU` (connectome-seeded RNNs; see Handoffs).
- **Weights:** there are no trained "weights" for the brain. Synaptic weights are synapse counts × one free parameter (W_syn = 0.275 mV). The imitation-learned NeuroMechFly controller weights Eon used are not released.
- **Third parties** have built their own bridges on the public brain code, for example `TheDragonChild/FlyPuter`, a Brian2-to-MuJoCo bridge. **[repo data]**

## Contradictions & open questions

1. **Was there RL in the loop?** The Transmitter says Eon "used deep reinforcement learning to connect" the parts. Eon's post says imitation-learned walking controllers plus hand-chosen DN mappings, and lists RL only as an alternative.
2. **Which connectome snapshot?** v630 (127,400 neurons) or v783 (138,639 to 139,255)? Not disclosed.
3. **"95% accuracy"** has no matching model-accuracy figure in the *Nature* paper (see §4).
4. **Wissner-Gross's role:** "co-founder" vs. "Founding Advisor" (see §1).
5. **The Decoder** (10 Mar) said the brain code was on GitHub but the body part "hasn't been released yet." Cointelegraph said there was "a GitHub repo and a video." Both fit the repo contents: brain-only.
6. **No quantitative validation** of the embodied behavior at all. The headline "91%" belongs to the 2024 disembodied model.
7. **Closed-loop compute and real-time factor** are undisclosed; the Register's "weeks or months" is speculation.
8. **Whether the 10 March tech post was revised** after the criticism (see §5).

## Handoffs

- **FlyWire researcher:** v630 vs. v783 counts; MaleCNS (Berg et al. 2026, *Cell*, ~166,700 neurons per Eon's perspective; unverified by me).
- **Shiu-model researcher:** the 0 Hz baseline, W_syn as the single free parameter, the 91% vs. 84% figures, and the 5 min per simulated second CPU cost.
- **Body researcher:** NeuroMechFly v2's imitation-learned controllers; why Eon skipped Vaxenburg's flybody.
- **Multi-agent researcher:**
  - DNs as a low-dimensional "control handle" interface between a planner (brain) and skilled executors (controllers);
  - the "digital sphinx" lesson: plausible behavior ≠ validated internals, so agents need held-out validation, not demos;
  - Eon's `pathintegrationBPU` repo (connectome-seeded RNNs show task–region alignment).

## Sources

- https://x.com/alexwg/status/2030217301929132323 (read via api.fxtwitter.com)
- https://theinnermostloop.substack.com/p/the-first-multi-behavior-brain-upload
- https://x.com/michaelandregg/status/2030764512488677736
- https://eon.systems/
- https://eon.systems/updates
- https://eon.systems/updates/weve-uploaded-a-fruit-fly
- https://eon.systems/updates/embodied-brain-emulation
- https://eon.systems/updates/more-flies-are-getting-uploaded
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/ (Shiu et al. 2024, *Nature* 634:210)
- https://www.nature.com/articles/s41586-024-07763-9
- https://www.biorxiv.org/content/10.1101/2023.05.02.539144v1
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11446842 (Dorkenwald et al. 2024, FlyWire)
- https://www.nih.gov/news-events/nih-research-matters/complete-wiring-map-adult-fruit-fly-brain
- https://pubmed.ncbi.nlm.nih.gov/39533006/ (NeuroMechFly v2)
- https://www.nature.com/articles/s41586-025-09029-4 (Vaxenburg et al. 2025, flybody)
- https://github.com/eonsystemspbc/fly-brain
- https://github.com/philshiu/Drosophila_brain_model
- https://github.com/eonsystemspbc/pathintegrationBPU
- https://the-decoder.com/startup-claims-first-full-brain-emulation-of-a-fruit-fly-in-a-simulated-body/
- https://www.theregister.com/a/5224139
- https://tech.yahoo.com/science/articles/scientists-upload-complete-fruit-fly-183733167.html
- https://forklog.com/en/researchers-upload-simulated-fly-brain-into-a-matrix/
- https://futurism.com/science-energy/research-fly-brain-matrix
- https://cointelegraph.com/magazine/flys-mind-uploaded-human-brain-cell-wetware-plays-doom-ai-eye
- https://www.theverge.com/ai-artificial-intelligence/894587/fly-brain-computer-upload (not fetched; via Mezha)
- https://mezha.ua/en/news/this-is-not-a-fly-309516/
- https://www.thetransmitter.org/systems-neuroscience/digital-sphinx-raises-questions-about-connectome-models/
- https://doi.org/10.64898/2026.03.20.713233
- https://www.lesswrong.com/posts/ybwcxBRrsKavJB9Wz/no-we-haven-t-uploaded-a-fly-yet
- https://x.com/KennethHayworth/status/2032604687212392562
- https://x.com/as_bates/status/2031064465337155774
- https://x.com/as_bates/status/2032846894301339769
- https://x.com/michalj/status/2031400471655506352
- https://untappedventures.substack.com/p/untapped-ventures-invests-in-eon
- https://seedtable.com/companies/eon-systems/funding-rounds/seed-2025-12
- https://letsdatascience.com/news/eon-systems-simulates-fly-brain-sparks-uploading-debate-08df28a8
