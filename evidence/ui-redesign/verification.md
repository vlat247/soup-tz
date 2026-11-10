# UI redesign verification

10 November 2026, `feature/ui-redesign`. Implementation spans `e9aed02`, `913ee4c`, and the final theme/evidence commit containing this file.

## Final direction

Black canvas, cream text, orange interface accents, charcoal `#141414` chart panels. Loss is orange `#FF794B`, learning rate blue `#82B1FF`, and gradient norm mint `#83CDA8`. The supplied icon is copied unchanged into the public asset and app icon, with its proportions preserved. Workspace decoration, duplicate legends, chart subtitles and reassurance slogans were removed; warnings, snapshot metadata and source inspection remain.

## Checks

- `check-01.txt`: complete check passed, including lint, strict types, 109 unit tests, all 20 exact catalog summaries and production build.
- `build-02.txt`: production rebuild after compact-layout refinements; lint also passed in the terminal.
- `check-03-black.txt`: complete check passed again after switching navy to black; 109 tests and production build passed.
- `build-04-chart-colors.txt`: final production build after changing chart surfaces and line colors; lint passed in the terminal. These final edits change colors only, not source data, reduction or interaction logic.

## Targeted browser observations

Used the Codex in-app browser on macOS against local development and production servers. Exact browser version was not captured. These are manual observations, not an automated browser suite.

- Desktop at 1280px and compact desktop at 900px: three charts render, labels and controls fit, no horizontal page overflow.
- 360px: run drawer search survives navigation, latest NaN is explicit with the earlier valid step, and the range form fits inside the viewport. The quality table scrolls inside its named, keyboard-focusable region rather than widening the page.
- Arrow keys switch metric/quality tabs with focus following selection. The inspector moves from step 500,000 to 500,001 with ArrowRight.
- `run-012`, step 700: exact source readings show both loss 0.5753684404213275 and 12; conflict markers have a legend.
- `run-009`, visible range 390–410: loss visibly breaks at the invalid reading at 400. Valid companion metrics remain visible.
- `run-020`: isolated loss spike remains visible at the full range; exact inspection reports loss 12 at step 500,000 and 0.2478 at 500,001. Production console had no captured warnings or errors during this check.
- Dataset information opens as a native dialog and Escape closes it. Synthetic provenance is available once per visible layout.
- Final chart line contrast against `#141414`: orange 7.10:1, blue 8.49:1, mint 9.88:1. Cream at 68% opacity over the panel is 6.42:1. These calculations do not certify all application states or accessibility criteria.

## Screenshots and limits

`final-desktop.jpg` shows the final charcoal-panel design. Other screenshots retain intermediate navy/black iterations and targeted data checks; they are not the final visual direction. The responsive and data-interaction checks preceded the final color-only adjustment.

No performance throttling, tab-memory measurements, full locale/assistive-technology matrix, baseline comparison or deployment was performed in this redesign. Existing release-evidence gaps remain documented in `docs/PRD_AUDIT.md`. The development demo remains on port 3000; temporary production previews use port 3001 and are stopped after verification.
