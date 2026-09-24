# UHCI scoring calibration

## Scope and data exports

The normalized data preserves the 30 questions from `muppet-questions.md` and
all 60 baseline rows from
`henson-personality-index-baselines.md`.

- `data/uhci-dimensions.mjs` defines the six dimensions and the 1-10 scale.
- `data/uhci-questions.mjs` defines stable question IDs, source wording,
  dimension associations, and reverse-scoring flags.
- `data/uhci-characters.mjs` defines stable character IDs, universe,
  source-order provenance, all six source scores, available repository image
  paths, and concise descriptions only where the repository already had result
  copy.
- `data/uhci.mjs` is the aggregate import surface.

Unavailable images and descriptions are represented as `null`. The two source
duplicate pairs have explicit `exactDuplicateGroup` values. The second Animal
row is retained as `muppets-animal-electric-mayhem`, with
`variantOf: "muppets-animal"` and an explicit context, rather than overwriting
the general Animal row.

## Analysis method

Run:

```sh
node scripts/analyze-calibration.mjs
```

The dependency-free script validates counts, score ranges, unique IDs, and
referenced image paths. It then analyzes the combined catalog and each
universe independently.

Win frequency is measured by exhaustively enumerating all 1,000,000
integer-valued profiles on the six-dimensional 1-10 grid and assigning each
profile to its nearest baseline by unweighted Euclidean distance. Exact ties
split one win equally among all nearest entries. The script also reports exact
duplicate profiles, nearest non-identical pairs, and per-dimension range,
population standard deviation, distinct values, and same-value pair rate.

This grid is a neutral geometry test, not an estimate of real user traffic.
Actual questionnaire averages can be fractional and real response
distributions will not be uniform. Production calibration should repeat the
analysis with anonymized response data or an explicitly documented response
model.

## Measured results

The statements in this section are direct outputs or arithmetic summaries of
the exhaustive analysis.

### Exact duplicate profiles

| Universe | Profile (ED/EC/SA/RL/SH/BS) | Entries | Consequence |
|---|---|---|---|
| Sesame Street | `4/6/6/3/2/6` | Biff, Sully | Neither entry has a unique winning profile. |
| Muppets | `6/7/3/4/8/7` | Statler, Waldorf | Neither entry has a unique winning profile. |

Without an explicit tie policy, an iteration-order implementation will make
the later entry unreachable. The existing Muppets result catalog already
treats Statler and Waldorf as a single duo, while the baseline source lists
them separately.

### Win-region imbalance

| Catalog | Largest win regions | Smallest win regions | Concentration |
|---|---|---|---|
| Sesame Street | Guy Smiley 21.735%, Oscar 14.885%, Count von Count 11.828%, Martians 11.707% | Tamir 0.143%, Papa Bear 0.162%, Zoe 0.310% | The top four entries own 60.155% of the integer grid. |
| Muppets | Uncle Deadly 8.236%, Beaker 7.563%, Swedish Chef 6.912%, Zoot 6.313%, Janice 6.209% | Floyd Pepper 0.389%, Animal (Electric Mayhem) 0.613%, Scooter 0.647% | The top five entries own 35.233% of the integer grid. |

The Sesame catalog is substantially more concentrated under the current
distance metric. A large geometric region does not prove a character will be
common in real responses, but it does show that the baseline has much more
decision-space coverage than its neighbors.

### Nearest-neighbor collisions

The Sesame catalog has eight non-identical pairs at Euclidean distance less
than or equal to `sqrt(2)`, compared with two in the Muppets catalog.

Four Sesame pairs are only one point apart in one dimension:

- Bert and Professor Hastings
- Ernie and Abby Cadabby
- Snuffleupagus and Julia
- Zoe and Barkley

The closest non-identical Muppets pairs are Lew Zealand/Dr. Teeth and Rizzo the
Rat/Newsman, both at distance `sqrt(2)`. General Animal and Electric Mayhem
Animal are distance `sqrt(3)` apart.

### Weak dimension separation

| Catalog | Weakest dimension | Range | Population SD | Same-value pair rate |
|---|---|---:|---:|---:|
| Sesame Street | SH | 2-5 | 0.716 | 40.460% |
| Sesame Street | ED (next weakest) | 3-7 | 1.093 | 22.989% |
| Muppets | SH | 3-8 | 1.274 | 19.770% |
| Combined | RL | 2-9 | 1.502 | 22.147% |

Show-Awareness is the weakest separating dimension in both individual
catalogs, and especially in Sesame Street. Emotional Containment is the
strongest by population standard deviation in both individual catalogs
(Sesame Street `2.123`, Muppets `2.525`).

### Question-to-score interpretation

The question source marks four cross-dimensional items:

- Q3: ED + SA
- Q15: SA + EC
- Q24: SH + BS
- Q29: BS + EC

The normalized export preserves both associations in source order. The current
quiz calculation groups each item only into its five-question primary block,
so the secondary association does not currently affect a score. No secondary
weight is specified by the source material.

## Calibration recommendations

The recommendations below are judgment based on the measured results. They are
not source facts.

1. **Resolve guaranteed ties before expanding result selection.** Keep Statler
   and Waldorf as one selectable duo, or establish distinct evidence-backed
   baselines. Make the same explicit product decision for Biff and Sully.
   Regardless of that decision, implement a deterministic, documented tie
   policy rather than relying on object or array order.
2. **Treat the two Animal rows as contextual alternatives, not silent
   competitors.** Prefer one canonical result in a general Muppets quiz. Use
   the Electric Mayhem variant only when the quiz context or result copy can
   explain the distinction.
3. **Revisit Sesame Show-Awareness first.** It has only four used values, a
   2-5 range, and 40.460% same-value character pairs. If SH is intended only
   to separate franchises, downweight or omit it for within-Sesame matching.
   If it is intended to separate Sesame characters, broaden baselines only
   after character-level review or response validation; do not spread values
   solely to improve a statistic.
4. **Reduce extreme Sesame Voronoi regions.** Review Guy Smiley, Oscar, Count
   von Count, and the Martians against nearby or missing archetypes. Then test
   whether evidence-backed baseline changes or additional eligible characters
   reduce the top-four 60.155% share without collapsing meaningful
   distinctions.
5. **Review dense Sesame neighbor clusters together.** The four distance-1
   pairs are the highest-priority collision set. A practical target for
   calibration trials is a minimum non-identical distance of at least `2.0`,
   followed by a rerun of the win-frequency report to ensure the change does
   not merely transfer an oversized region to another character.
6. **Specify cross-loading weights before using them.** Either declare the
   first listed dimension as the sole scoring dimension, matching current
   behavior, or define and validate secondary weights. Avoid counting a
   cross-loaded response fully in two dimensions because that changes both
   scale reliability and distance geometry.
7. **Validate with real or modeled response distributions.** Compare the
   uniform-grid findings with anonymized user profiles, report win rates and
   tie rates by universe, and set an acceptance band before changing source
   baselines. Uniform-grid balance should be a diagnostic, not the sole
   optimization target.
