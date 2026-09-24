# Which Character Are You?

A static, browser-only character quiz for playful self-reflection, not a
psychological assessment. Choose a quick Muppet preview, a fuller Muppet
profile, or a five-question Sesame Street quiz. No account is required.

## Product journeys

| Route | Experience |
| --- | --- |
| `index.html` | Character-first entry point with quick and full quiz choices. |
| `muppets.html` | Six-question **provisional** preview, one question per UHCI dimension. |
| `muppets.html?mode=full` | Thirty-question profile; refining a preview preserves its six answers and asks the remaining 24. |
| `sesame-street.html` | Five-question character-vote quiz with four possible results. |
| `results.html?character=<id>` | A shared character reveal, without the sender's answers or scores. |
| `results.html?example=1` | Explicitly labeled example of the richer profile, not a visitor's result. |
| `credits.html` | Sources, licenses, and attribution for local character portraits. |

The guided quiz supports back navigation, saved progress, and reset. Muppet
results explain the closest match, nearby matches, and six profile dimensions.
The production roster remains the original **15 Muppet results and four Sesame
Street results**, with stable character IDs. Statler and Waldorf are one result;
the 60-entry reference inventory is not the selectable production cast.

## Architecture and scoring

HTML entry points use native JavaScript modules, shared CSS, and local images.
There is no framework, bundler, runtime package dependency, or application
backend. `package.json` provides Node's built-in test runner.

- `js/quiz-controller.js` manages the guided question flow and browser progress.
- `js/quiz-engine.js` validates responses, computes dimension averages, and
  ranks Muppet character baselines.
- Quiz entry modules and `data/` keep content separate from presentation.
- `js/muppet-profile.js` adapts the existing Muppet roster and questionnaire
  to the reusable `js/results-view.js` renderer.
- `js/results-page.js` handles standalone examples and incoming result links;
  `js/result-sharing.js` supplies sharing and downloadable result cards.
- `styles.css`, `styles/quiz.css`, and `styles/results.css` cover the site,
  guided questions, and result visualizations.

Muppet scoring uses the six Unified Henson Character Inventory (UHCI)
dimensions: Event Drive, Emotional Containment, Social Aim, Reality Lens,
Show-Awareness, and Behavioral Stability. Responses use a 1-10 scale. Flagged
items are reversed, each item's primary dimension receives its score, and
dimension averages are compared with eligible character baselines using
unweighted Euclidean distance. Five visible frequency choices now map to the
equally spaced values `1, 3.25, 5.5, 7.75, 10`, rather than the earlier
`1, 3, 5, 7, 10`; reversal is `11 - value`. This deliberate scale change is
not an accuracy claim. Exact ties sort by ascending character ID.
Displayed match similarity is `100 * (1 - distance / (9 * sqrt(6)))`, not a
probability, diagnostic finding, or validated confidence estimate.

The six-question path has one item per dimension and is intentionally
provisional. Thirty questions provide more input, not a claim of scientific
validity. Sesame uses direct character votes, not a fabricated UHCI profile.
See [scoring calibration](docs/scoring-calibration.md) for reference-model
limitations and proposed evaluation methods.

## Privacy

Answers and resumable progress stay in browser storage on the current device;
they are not submitted to a quiz server. Reset clears the corresponding saved
quiz progress. Browser storage can be unavailable or cleared, so a saved
session is not a backup or cross-device account.

The default share URL contains only a production character ID. It does not
contain individual answers, dimension scores, or a completion history.
Copying or sharing a result is an explicit visitor action. Downloaded cards
are generated in the browser. Any detailed profile URL a visitor explicitly
chooses to share exposes its encoded dimensions to recipients; encoding is
not encryption. Do not put sensitive information in shared URLs.

There are no analytics events, tracking dependencies, account records, or
application-side completion/fit/share metrics. The static hosting provider
still receives ordinary page requests; this is not a promise about its
infrastructure logs.

## Local preview and checks

Use Node.js, Python 3.9 or newer, and Bash. No `npm install` is needed:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000/>. Serve over HTTP rather than opening files
directly, because browser modules and origin-specific storage require it.

```bash
npm test
./scripts/validate-site.sh
./scripts/build-pages.sh /tmp/which-character-pages
```

The validator checks HTML references, nested CSS assets, `.js`/`.mjs` syntax,
literal module imports/re-exports, and catalog image paths. Root-relative
references fail because they break GitHub Pages project subpaths. Literal
reference checks do not replace browser tests for generated URLs or DOM logic.
The packager runs the same checks against the staged artifact, catching
dependencies that exist in the repository but were not deployed.

For a Pages-subpath preview:

```bash
preview_root="$(mktemp -d)"
./scripts/build-pages.sh "$preview_root/which-character-are-you"
python3 -m http.server 8001 --directory "$preview_root"
```

Open <http://localhost:8001/which-character-are-you/>. Check quick/full/refine,
reload/resume, back/reset, Sesame, sample results, recipient links, malformed
links, copy/download, keyboard operation, and mobile layouts.

## Deployment and contributing

GitHub Actions validates tests and site references on pushes and pull requests.
The Pages workflow deploys pushes to `main` and supports manual runs.
`scripts/build-pages.sh` creates an explicit allowlisted artifact: production
HTML, named runtime modules/data/styles, local image formats, and `.nojekyll`.
It does not upload the repository root. Prototypes, tests, documentation,
analysis scripts, package metadata, and Git/workflow files remain unpublished.

Add new runtime dependencies explicitly to the packaging allowlist. Keep all
links project-subpath safe, preserve the production character IDs, add focused
tests for behavior changes, and update these notes when the architecture
changes. Staging uses `_site` or a directory outside the repository and refuses
unmarked nonempty output directories and symbolic-link public assets.

Reference-only material includes `henson-personality-index.md`,
`henson-personality-index-baselines.md`, `muppet-questions.md`, and
`scripts/analyze-calibration.mjs`. Their broader inventories are not a promise
of more selectable characters or a future catalog expansion.
