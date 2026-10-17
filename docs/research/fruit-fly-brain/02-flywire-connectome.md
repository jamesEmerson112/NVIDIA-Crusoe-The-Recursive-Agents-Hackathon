# 02. The FlyWire connectome (the wiring diagram)

Researcher lane: the connectome itself (data, numbers, limits, access). Compiled 2026-10-17. Handoffs: Eon's announcement -> `01`; the Shiu et al. spiking model built on this graph -> `03`; fly body simulations (NeuroMechFly, flybody) -> `04`; agent-design translation -> `05`.

Evidence labels: **[PR]** peer-reviewed, **[PP]** preprint, **[DOC]** project documentation or data repository, **[PRESS]** press or secondary source (including Wikipedia).

## TL;DR

- FlyWire is a whole-brain connectome of **one adult female *Drosophila***: **139,255 proofread neurons** and **~54.5 million chemical synapses** (the abstract rounds this to 5x10^7). It is built on the FAFB electron-microscopy volume, segmented by AI, and fixed by about 33 person-years of crowdsourced human proofreading ([Dorkenwald et al., Nature, 2 Oct 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446842/)) [PR].
- At a 5-synapse threshold the graph has **2,700,513 connections**, 78 neuropils and **8,453 annotated cell types** ([Schlegel et al. 2024](https://doi.org/10.1038/s41586-024-07686-5)) [PR]. Each neuron's excitatory or inhibitory identity is *predicted from EM images*: 87% accurate per synapse and 94% per neuron ([Eckstein et al., Cell 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11106717/)) [PR].
- What it lacks: gap junctions, neuropeptides and receptors, real synaptic strengths, any dynamics, and the body side. **FAFB stops at the neck**, so the 1,303 descending neurons are cut off from the legs and wings they drive.
- To link brain to body you need a brain-plus-nerve-cord connectome. **BANC** (female, 2025 preprint, Nature 2026) and the **Janelia male CNS** (Cell, Sept 2026) both have an intact neck. MANC and FANC cover the nerve cord alone.
- **It is practical at a hackathon if you use the edge list, not the synapse table.** The Shiu repo's `Connectivity_783.parquet` is about 101 MB and loads in pandas. The full Zenodo synapse table is 9.5 GB. Pin the data version: Codex synapses may have changed after July 2025.
- Graph facts useful for agent design (details in section 7):
  - about 30% of neurons form a "rich club" of highly connected hubs;
  - about two-thirds of neurons sit in at least one reciprocal (two-way) connection;
  - excitatory-inhibitory loops are the most common reciprocal pairing;
  - only about 1% of neurons are outputs (efferent), a narrow brain-to-body bottleneck.

## 1. What FlyWire is

- **The image volume (FAFB).** "Full Adult Fly Brain" is a serial-section transmission EM dataset of one female brain at 4x4x40 nm per voxel ([Zheng et al., Cell 2018, as cited in Dorkenwald](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446842/)) [PR]. By comparison, Janelia's hemibrain used 8x8x8 nm FIB-SEM.
- **AI segmentation.** All cells were segmented automatically with "a neuronal boundary-detecting neural network and mean affinity agglomeration" (Seung lab, Princeton) [PR].
  - Synapses came from [Buhmann et al. (Nature Methods 2021)](https://link.springer.com/article/10.1038/s41592-021-01330-0) [PR]. That method found ~244M candidate synaptic partners, with f-scores of 0.59 to 0.73 depending on brain region.
  - FlyWire filtered those to ~130M synapses in the neuropil. Of these, ~54.5M connect two proofread neurons ([Dorkenwald](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446842/)) [PR].
- **Crowdsourced proofreading.**
  - "Hundreds of scientists and proofreaders from more than 50 laboratories" took part, and the top 100 Eyewire citizen-science players were invited to beta-test [PR].
  - Release v783 took **3,013,513 edits** and about **33 person-years** of work.
  - When 826 central-brain neurons were independently re-proofread, the proofread reconstruction scored an average **F1 of 99.2% by volume**. The authors call the accuracy "similar to that of the hemibrain" [PR].
- **Consortium.** The FlyWire Consortium is Princeton-led, with Mala Murthy and Sebastian Seung as leads ([NIH](https://www.nih.gov/news-events/nih-research-matters/complete-wiring-map-adult-fruit-fly-brain)) [PRESS]. Whole-brain annotation was led from Cambridge and MRC LMB (Jefferis, Schlegel) together with Bock [PRESS/PR].
- **The 2 October 2024 Nature package** had nine papers ([NIH](https://www.nih.gov/news-events/nih-research-matters/complete-wiring-map-adult-fruit-fly-brain)) [PRESS].
  - Verified by me:
    - Dorkenwald et al., wiring diagram, 634:124-138 [PR]
    - Schlegel et al., whole-brain annotation and cell typing, 634:139-152 [PR]
    - [Lin et al.](https://doi.org/10.1038/s41586-024-07968-y), network statistics, 634:153-165 [PR]
    - [Matsliah et al.](https://doi.org/10.1038/s41586-024-07981-1), visual-system parts list, 634:166-180 [PR]
    - [Shiu et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/), whole-brain leaky integrate-and-fire (spiking) model, 634:210 -> `03` [PR]
  - Reported in press but not verified by me: a paper on circuits that halt walking, and a visual-navigation paper (Kim, Wernet and colleagues) ([Sci Am](https://www.scientificamerican.com/article/largest-brain-map-ever-reveals-fruit-flys-neurons-in-exquisite-detail/)) [PRESS].
  - Foundational but outside the package: Eckstein et al. (Cell, May 2024) and Buhmann et al. (2021).

## 2. Hard numbers (FlyWire v783 unless noted)

| Quantity | Value | Source / label |
|---|---|---|
| Proofread neurons | 139,255 | Dorkenwald [PR] |
| Intrinsic neurons (start and end inside the brain) | 118,501 (~85%): 32,388 central brain, 77,536 optic lobes plus ocellar ganglia | Dorkenwald [PR] |
| Afferent / efferent (input / output) share | 13.9% / 1.1% of brain neurons | Dorkenwald [PR] |
| Sensory inputs | 11,118 compound-eye photoreceptors, 273 ocellar photoreceptors, 5,375 non-visual sensory neurons | Dorkenwald [PR] |
| Neck connective (brain-to-cord link) | 1,303 descending, 2,362 ascending neurons | Dorkenwald [PR] |
| Other outputs | 106 head motor neurons, 80 endocrine neurons | Dorkenwald [PR] |
| Optic lobe to central brain boundary | 8,053 visual projection neurons, 524 visual centrifugal neurons | Dorkenwald [PR] |
| Synapses between proofread neurons | ~54.5M (abstract: "5x10^7") | Dorkenwald [PR] |
| Connections (5 or more synapses) | 2,700,513 among 134,181 neurons; intrinsic median in-degree 11, out-degree 13 | Dorkenwald [PR] |
| Highest-degree neuron | CT1, a GABAergic visual interneuron: 6,399 postsynaptic and 5,080 presynaptic partners | Dorkenwald [PR] |
| Cell types | 8,453: 3,643 first proposed in the hemibrain, 4,581 new | Schlegel [PR] |
| Optic-lobe intrinsic types | 38,500 intrinsic neurons grouped into 226 types | Matsliah preprint ([PMC10592826](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10592826/)) [PP] |
| Neuropils (anatomical brain regions) | 78 | Dorkenwald, Lin [PR] |

## 3. How excitatory or inhibitory identity is predicted from EM

- [Eckstein, Bates et al. (Cell, 9 May 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11106717/) trained a neural network on EM images of individual synapses [PR].
  - It predicts one of six transmitters: acetylcholine, glutamate, GABA, serotonin, dopamine or octopamine.
  - Training used 3,025 neurons whose transmitter was already known, and assumed Dale's law (one transmitter per neuron).
  - Reported accuracy: **87% per synapse, 94% per neuron** (majority vote), and **91% per known cell type**.
  - Neurons from the same developmental lineage (hemilineage) largely share a single fast-acting transmitter.
- In FlyWire, predictions are "highly accurate in aggregate". The connectivity graph itself, however, is *unsigned*: it does not say which edges excite or inhibit ([Dorkenwald](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446842/)) [PR]. Codex shows a predicted transmitter with a confidence score, and sometimes a curated "verified" transmitter or neuropeptide. The FAQ warns the two can disagree ([Codex FAQ](https://codex.flywire.ai/faq)) [DOC].
- **Assigning a sign is a modeling choice, not data.** Shiu et al. treat GABA and glutamate as inhibitory and the monoamines as excitatory (-> `03`; also summarized in `05`).
- Two caveats from general fly biology, not from these papers:
  - The effect of a transmitter depends on the receptor. Glutamate, for example, can excite or inhibit.
  - Some fly transmitters are outside the six classes, such as histamine, which photoreceptors use.

## 4. What the connectome does NOT capture

- **Electrical synapses (gap junctions).** Dorkenwald states connectivity "is limited to chemical synapses". Higher-resolution EM "might enable" reconstructing electrical synapses [PR]. I found no FlyWire effort to annotate gap junctions (innexins).
- **Neuromodulation, only partly.** The six classes include three monoamines, so dopamine, serotonin and octopamine neurons *are* flagged. Still missing:
  - neuropeptides and receptor identities;
  - volume transmission (signaling outside synapses);
  - hormones;
  - the actual *effect* of modulation on circuits.

  Codex has curated neuropeptide labels for some neurons [DOC]. The BANC repo lists a `drosophila_neuropeptides` prediction tool, which I did not verify [DOC].
- **Synapse count is not strength.**
  - False negatives dominate the synapse errors, so counts "underrepresent the actual number of synapses". Sensory neurons are "particularly affected" [PR].
  - Total synapse count correlates with a neuron's degree (R ~0.93-0.94) but only weakly with average connection strength (R ~0.25-0.3) [PR].
  - The authors advise tuning thresholds for each analysis.
  - Synapse size, release probability and plasticity state are not in the graph.
- **No dynamics.** There are no membrane properties, time constants or biophysics. Any simulation must supply them (-> `03`).
- **One animal, one sex, one damaged side.**
  - The data come from a single female.
  - "The left lamina was partially severed from the medulla", an artefact on one side of the optic lobe [PR].
  - Comparing FlyWire with the hemibrain (two different animals): about one-third of hemibrain cell types could not be reliably re-identified. The most common mushroom-body type is almost twice as numerous in FlyWire ([Schlegel preprint](https://pmc.ncbi.nlm.nih.gov/articles/PMC10327018/)) [PP; published as Schlegel 2024, PR].
  - Strong connections are conserved: those with more than 10 synapses, or more than 1% of a target's input. Weights vary "surprisingly" within and across animals. Left-right is a within-animal comparison; FlyWire versus hemibrain is across animals.
  - Sex-specific or dimorphic types make up about 4.8% of the *male* central brain, and fewer than 3% of female brain neurons are dimorphic ([Berg et al., Cell 2026](https://www.janelia.org/publication/sexual-dimorphism-in-the-complete-drosophila-male-central-nervous-system-connectome) [PR]; [MRC LMB](https://mrclmb.ac.uk/?p=17807) [PRESS]). A female brain is not a male brain.
- **No ventral nerve cord (VNC).** FAFB is brain-only. The descending and ascending neurons are cut at the neck, so motor circuits for the legs and wings are absent. A body simulation needs a separate VNC connectome plus a mapping from motor neurons to muscles (-> `04`).

## 5. Related connectomes and what a whole-fly emulation would need

| Dataset | Scope / sex | Scale | Status / date | Access |
|---|---|---|---|---|
| Hemibrain v1.2.1 (Janelia FlyEM, Google) | About half the central brain, FIB-SEM 8 nm | ~25,000 neurons, ~20M connections | [eLife, 7 Sep 2020](https://elifesciences.org/articles/57443) [PR] | neuPrint |
| FANC (Harvard, UW) | Female VNC | Not verified | Phelps 2021; Azevedo 2024 (details not verified) [PRESS] | CAVE |
| MANC v1.2.1 (Janelia et al.) | Male VNC | ~23,000 neurons ([Janelia](https://www.janelia.org/manc-connectome)); 23,665 in Codex | Released June 2023; [eLife 2024](https://elifesciences.org/articles/96084) [PR] | neuPrint, Codex |
| MAOL v1.1 | Male right optic lobe | 52,445 neurons | [Codex listing](https://codex.flywire.ai/api/download) [DOC] | Codex |
| **BANC v888** (Harvard, Princeton, FlyWire) | **Female brain plus VNC**, ssEM at 4 nm in-plane | 158,262 neurons (Codex) / ~188,000 neurons and 199M predicted synapses ([README](https://raw.githubusercontent.com/htem/BANC-project/main/README.md)) | Preprint July 2025 ([bioRxiv](https://www.biorxiv.org/content/10.1101/2025.07.31.667571v2)) [PP]; Nature 2026, DOI 10.1038/s41586-026-10735-w (per README; not fetched) [DOC] | Codex, Harvard Dataverse (CC BY 4.0), CAVE |
| **Male CNS v1.0** (Janelia, Cambridge, MRC LMB, Google) | **Male brain, optic lobes and VNC with an intact neck** | 166,700 neurons, 11,710 cell types | v0.9 Oct 2025; v1.0 8 Jun 2026; [Cell 189(18), 3 Sep 2026](https://www.janelia.org/publication/sexual-dimorphism-in-the-complete-drosophila-male-central-nervous-system-connectome) [PR] | neuPrint, Clio, downloads; [CC-BY](https://male-cns.janelia.org) |

**Which one an embodied emulation needs.** FlyWire's 1,303 descending neurons are where brain-to-body signals leave. Three options:

1. **Stitch FlyWire's brain to MANC or FANC** by matching descending and ascending neuron types across animals. This mixes animals, and with MANC also mixes sexes.
2. **Use BANC.** It is the same sex as FAFB, one animal and one continuous neck, and its pipeline is FlyWire-compatible (CAVE, Codex).
3. **Use the male CNS.** It is fully proofread and complete, with an intact neck, but it is male.

BANC's own abstract makes the case for modeling the cord ([FlyWire blog](https://blog.flywire.ai/?p=1823); [Wilson lab](https://wilson.hms.harvard.edu/publication/distributed-control-circuits-across-brain-and-cord-connectome-0)) [PP]. Effector neurons are mostly driven by sensory neurons in the same body part, through local feedback loops. Control is "distributed, parallelized and embodied". No simulation coupling a FlyWire brain to a BANC or male-CNS cord surfaced in my searches, but I did not search for one specifically. Whether Eon did so -> `01`.

## 6. How to access it today, and is it hackathon-practical?

- **[FlyWire Codex](https://codex.flywire.ai)** [DOC]
  - Requires Google sign-in for interactive apps.
  - Hosts FAFB v783 (Oct 2023, latest), BANC v888 (20 May 2026), MANC v1.2.1, MAOL v1.1 and male CNS v1.0.
  - Static downloads are gzipped CSVs, for example `connections_princeton` and `consolidated_cell_types`.
  - Default minimum synapses per connection: FAFB 5, BANC 3, MANC and MAOL 1, male CNS 5.
  - No bulk live-query API. Use the static downloads or a Colab notebook with your `api_token` ([FAQ](https://codex.flywire.ai/faq)).
- **[Zenodo 10676866](https://zenodo.org/records/10676866)**, v783, June 2024, **CC BY 4.0**, 10.6 GB total [DOC]:
  - `flywire_synapses_783.feather`, 9.5 GB
  - `proofread_connections_783.feather`, 852 MB
  - per-neuron neuropil counts
  - `proofread_root_ids_783.npy`
- **[flywire_annotations](https://github.com/flyconnectome/flywire_annotations)** has the Schlegel annotation TSVs (superclass, cell type, side, transmitter). Releases v2.0.0 and later are based on v783 [DOC].
- **Live and programmatic access** [DOC]:
  - CAVEclient and cloudvolume serve meshes and volumes, and need a token from `global.daf-apis.com` ([fafbseg setup](https://fafbseg-py.readthedocs.io/en/latest/source/tutorials/flywire_setup.html)).
  - `fafbseg-py` (Python); `navis`; `navis-flybrains` for coordinate transforms between FAFB, FANC, BANC, MANC and JRC2018F ([repo](https://github.com/navis-org/navis-flybrains)); R tools natverse and coconatfly. BANC also has a `banc` PyPI client.
- **Licensing is split** [DOC/PR]:
  - The Nature papers and the Zenodo dump are CC BY 4.0. The male CNS and BANC Dataverse snapshot are CC BY.
  - [FlyWire's terms](https://flywire.ai/tos) put proofreading edits and annotations under **CC-BY-NC 4.0**.
  - Codex points to a citation table I could not read. Commercial use of FlyWire-hosted annotations is therefore ambiguous.
- **Hackathon verdict: yes, at the edge-list level.**
  - The [Shiu repo](https://github.com/philshiu/Drosophila_brain_model) ships `Connectivity_783.parquet` (100,804,642 bytes) and `Completeness_783.csv` (3.3 MB). Sizes are from GitHub HTTP headers I checked today. Its code is MIT-licensed and defaults to v630.
  - An edge list of 2.7M rows fits comfortably in laptop RAM with pandas or networkx-style tools. That is my estimate, not measured.
  - Skip the 9.5 GB synapse table, the meshes and CAVE for a 10-hour build.
  - **Pin your version.** Codex says synapses released before July 2025 used an earlier method ([About](https://codex.flywire.ai/about_flywire)). A new detector ([Yu et al. 2025](https://www.biorxiv.org/content/10.1101/2025.07.11.664377v1)) [PP] reportedly has better recall but somewhat worse precision ([Wikipedia](https://en.wikipedia.org/wiki/Drosophila_connectome)) [PRESS]. To reproduce the Nature paper or the Shiu model, use the Zenodo or Shiu files, not a fresh Codex export.

## 7. Graph-structure facts that could inspire agent design (facts only; translation -> `05`)

Lin et al. figures below come from the **preprint ([PMC10402125](https://pmc.ncbi.nlm.nih.gov/articles/PMC10402125/), probably the v630 graph: 127,978 neurons, 2,613,129 edges)** [PP]. The Nature version keeps the headline "30% rich club" [PR], but exact values may differ.

1. **Sparse.** The chance that any two neurons are connected is ~1.6x10^-4 [PP]. The median intrinsic neuron has about 11 inputs and 13 outputs [PR].
2. **Narrow output bottleneck.** About 85% of neurons are intrinsic and only 1.1% are efferent. There are 1,303 descending neurons and 2,362 ascending neurons, so nearly twice as many ascending as descending [PR].
3. **Rich club.**
   - Neurons with total degree above 37 form the rich club: 40,218 neurons, about 30%. They connect to each other 5.4 times more often than the network average [PP].
   - The club contains 676 "broadcasters" (mostly output) and 638 "integrators" (mostly input). For comparison, C. elegans has an 11-neuron rich club (4%) [PP].
   - Codex exposes these as `connectivity_tag` values ([FAQ](https://codex.flywire.ai/faq)) [DOC].
4. **Recurrence, not pipelines.**
   - Reciprocity is 0.138, above null models, and about two-thirds of neurons are in at least one reciprocal pair [PP].
   - Pure feedforward 3-node motifs are under-represented. Recurrent motifs (3-unicycles and denser loops) are over-represented.
   - Feedforward loops are over-represented, except in the central complex and mushroom-body compartments [PP].
   - Reciprocal edges are stronger on average than one-way edges [PP].
5. **Excitation-inhibition loops.** Acetylcholine-GABA (excitatory-inhibitory) is the most common reciprocal pairing, and acetylcholine-acetylcholine (excitatory-excitatory) pairs are under-represented [PP]. 1,863 neuropil-specific highly reciprocal neurons are 54% GABAergic [PP]. Dorkenwald calls reciprocal inhibitory-excitatory motifs widespread [PR].
6. **Small world.** 93.3% of neurons are in one strongly connected component, where every neuron can reach every other. The mean directed path is 4.42 hops (maximum 13). Small-worldness is S = 141, versus 3.21 for C. elegans [PP].
7. **Flow.**
   - Nearly every central-brain neuron can be reached from any sensory modality. The exception is the central complex, which is "dominated by internal computation" [PR].
   - Putative inhibitory neurons are over-represented among the neurons reached early from sensory inputs [PR]. That traversal model marks a neuron reached once 30% of its inputs are reached. The 30% is a model parameter, not biology.
   - In a random walk over the graph, 3% of neurons ("attractors") collect 61.2% of forward visits [PP].
8. **A single inhibitory mega-hub.** CT1 has more than 5,000 input partners and more than 5,000 output partners [PR].
9. **Modules.**
   - 78 neuropils serve as anatomical modules [PR]. I did not find a modularity score.
   - Neurons from one developmental lineage share a fast transmitter, so modules tend to share a sign [PR].
   - BANC finds behavior-centric modules of descending and ascending neurons, with learning and navigation centers "supervising" local loops in the cord [PP/PR].
10. **Robust topology, noisy weights.** Strong edges are stereotyped across animals, while weights vary [PR].

## Contradictions & open questions

1. **Synapse count:** "5x10^7" (abstract) versus "~54.5 million" (main text and press). Same data, different rounding.
2. **Connection count:**
   - 2,700,513 (Dorkenwald, 5-synapse threshold, 134,181 neurons)
   - 2,613,129 (Lin preprint, probably v630, 127,978 neurons)
   - 3,732,460 (Codex FAFB v783). The FAQ notes that Codex lists one row per neuron pair *per neuropil*, which likely inflates the count. Not reconciled exactly.
3. **Lin et al. exact numbers** (reciprocity, degree threshold 37, 676/638, S = 141) come from the preprint. Nature-version values are unverified.
4. **Schlegel arithmetic:** 3,643 + 4,581 = 8,224, which is not 8,453. The source of the 229-type gap is unexplained in what I read.
5. **BANC size:**
   - Neurons: 158,262 (Codex v888) versus ~188,000 (README) versus ~160K (Wikipedia).
   - Synapses: 199M (README) versus ~214M (Wikipedia).
   - The Nature 2026 publication is confirmed only by the project README and secondary sources; I did not fetch the article.
6. **Male CNS:** synapse count is unverified: 125M (press aggregator) versus 312M (Wikipedia). The v0.9 date appears as both 3 and 5 Oct 2025.
7. **Does today's Codex v783 use the Yu et al. 2025 synapses?** Unclear. The answer affects reproducibility.
8. **Licence:** CC-BY data dumps versus CC-BY-NC FlyWire edits and annotations. The status for commercial or startup use (relevant to Eon -> `01`) is unclear.
9. **Nine-paper list:** only five are verified here.
10. **Gap junctions:** no annotation effort found. Their absence matters for any "emulation" claim.
11. **MANC count:** Wikipedia's table lists ~14,600 neurons, while Janelia and Codex list ~23,000. I trusted the primary sources.

## Sources

- https://pmc.ncbi.nlm.nih.gov/articles/PMC11446842/ (Dorkenwald et al. 2024, Nature 634:124)
- https://doi.org/10.1038/s41586-024-07558-y
- https://doi.org/10.1038/s41586-024-07686-5 (Schlegel et al. 2024)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10327018/ (Schlegel preprint)
- https://doi.org/10.1038/s41586-024-07968-y (Lin et al. 2024)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10402125/ (Lin preprint)
- https://ora.ox.ac.uk/objects/uuid:9184bc53-8b87-4842-aac0-981acc1abe25
- https://doi.org/10.1038/s41586-024-07981-1 and https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10592826/ (Matsliah)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/ (Shiu et al. 2024)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11106717/ (Eckstein et al. 2024)
- https://link.springer.com/article/10.1038/s41592-021-01330-0 (Buhmann et al. 2021)
- https://www.nih.gov/news-events/nih-research-matters/complete-wiring-map-adult-fruit-fly-brain
- https://www.scientificamerican.com/article/largest-brain-map-ever-reveals-fruit-flys-neurons-in-exquisite-detail/
- https://codex.flywire.ai/about_flywire , https://codex.flywire.ai/faq , https://codex.flywire.ai/api/download
- https://flywire.ai/tos
- https://zenodo.org/records/10676866
- https://github.com/flyconnectome/flywire_annotations
- https://github.com/philshiu/Drosophila_brain_model
- https://fafbseg-py.readthedocs.io/en/latest/source/tutorials/flywire_setup.html
- https://github.com/navis-org/navis-flybrains
- https://elifesciences.org/articles/57443 (hemibrain)
- https://www.janelia.org/manc-connectome , https://elifesciences.org/articles/96084 (MANC)
- https://blog.flywire.ai/?p=1823 , https://raw.githubusercontent.com/htem/BANC-project/main/README.md , https://www.biorxiv.org/content/10.1101/2025.07.31.667571v2 , https://wilson.hms.harvard.edu/publication/distributed-control-circuits-across-brain-and-cord-connectome-0 (BANC)
- https://male-cns.janelia.org , https://male-cns.janelia.org/release/ , https://www.janelia.org/publication/sexual-dimorphism-in-the-complete-drosophila-male-central-nervous-system-connectome , https://mrclmb.ac.uk/?p=17807 (Male CNS)
- https://www.biorxiv.org/content/10.1101/2025.07.11.664377v1 (Yu et al. 2025, listed on https://murthylab.princeton.edu/publications)
- https://en.wikipedia.org/wiki/Drosophila_connectome
