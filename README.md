# Which Character Are You?

A small, dependency-free static website with quizzes that match answers to
Sesame Street and Muppet characters. The repository is intentionally simple:
open the site in a browser, answer the questions, and receive the character
with the highest score.

## Current architecture

The production site is plain HTML, CSS, and inline JavaScript:

- `index.html` links to the available quizzes.
- `sesame-street.html` and `muppets.html` contain their questions, character
  metadata, scoring logic, and result rendering.
- `styles.css` supplies the shared presentation.
- `images/` contains the locally hosted character portraits used by quiz results.
- `credits.html` records the source and license for every character image.

There is no package manager, application framework, build-time JavaScript, or
backend service. Each quiz currently uses direct vote counting: every answer
adds one vote to a character, and the character with the most votes wins.

## UHCI reference model

The repository also contains the Unified Henson Character Inventory (UHCI), a
six-dimension, 1-10 reference model for describing character personalities:

| Dimension | Range |
| --- | --- |
| Event Drive (ED) | Reactive to agentic |
| Emotional Containment (EC) | Explosive to regulated |
| Social Aim (SA) | Self-directed/oppositional to communal/nurturing |
| Reality Lens (RL) | Concrete/literal to absurd/surreal |
| Show-Awareness (SH) | Immersed to meta/performative |
| Behavioral Stability (BS) | Volatile to steady |

`henson-personality-index.md` defines the dimensions, and
`henson-personality-index-baselines.md` records proposed character baselines.
These files are design references today; the deployed quizzes do **not** yet
calculate UHCI profiles.

### Planned scoring/data separation

A future architecture may move questions, character profiles, and scoring out
of the HTML pages into independently validated data and JavaScript modules.
That separation should make it easier to:

- reuse one scoring engine across quizzes;
- validate question and character data without parsing HTML;
- compare quiz outcomes with UHCI baselines; and
- change content without changing rendering code.

Until that work is implemented, contributors should treat the inline quiz
objects and vote-counting logic as the source of current behavior.

## Local preview

The site must be served over HTTP so local behavior matches GitHub Pages:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

No dependency installation is required.

## Repository layout

```text
.
├── .github/workflows/               # Validation and GitHub Pages automation
├── images/                          # Public character portraits
├── credits.html                     # Image sources, attribution, and licenses
├── scripts/
│   ├── build-pages.sh               # Creates the explicit Pages artifact
│   └── validate-site.sh             # Runs static-site validation
├── index.html                       # Site landing page
├── muppets.html                     # Muppet quiz and inline scoring
├── sesame-street.html               # Sesame Street quiz and inline scoring
├── styles.css                       # Shared site styles
├── henson-personality-index.md      # UHCI dimension reference
├── henson-personality-index-baselines.md
└── muppet-questions.md              # Question-design reference
```

The personality and question markdown files are repository documentation, not
public site assets.

## Validation

Run the same lightweight checks used by CI:

```bash
./scripts/validate-site.sh
```

The validator:

- verifies required site files and the image directory;
- checks local HTML links and asset references, including character images;
- checks CSS `url(...)` references;
- runs `node --check` on inline scripts and any JavaScript files that exist.

The checks use Bash, Python's standard library, and Node.js. GitHub-hosted
runners provide all three; local contributors need them available on `PATH`.

To inspect the exact Pages package without committing generated output:

```bash
./scripts/build-pages.sh /tmp/which-character-pages
find /tmp/which-character-pages -type f -print
```

## Deployment

`.github/workflows/deploy.yml` deploys pushes to `main` and supports manual
runs. It validates the source, stages only the public HTML, CSS, SVG images,
and a generated `.nojekyll` file, uploads that directory as the Pages artifact,
and deploys it through GitHub Pages.

The workflow does not publish the repository root. README files, design
documents, scripts, Git metadata, and workflow definitions are excluded from
the deployed artifact. The public image credits page is included with the
deployed quiz pages.

`.github/workflows/validate.yml` runs validation and a packaging smoke test for
pushes and pull requests.

## Contributing

1. Preview the current site before changing behavior.
2. Keep content, scoring, and presentation changes focused and reviewable.
3. Preserve relative links so the site works at a GitHub Pages project path.
4. Add every new public asset to `scripts/build-pages.sh`; otherwise it will
   intentionally remain outside the deployed artifact.
5. Run `./scripts/validate-site.sh` and a local preview before opening a pull
   request.
6. Update this README when the current architecture changes, especially when
   UHCI-backed scoring or separated data modules become real rather than
   planned.
