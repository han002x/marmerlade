# README animation

`halloween-demo.gif` records the AI support agent example in Marmerlade's
Halloween appearance. It shows the folded overview, nested retrieval and search
groups, flow playback, and the Mermaid source before returning to the overview.

## Recreate the GIF

Requires the project's npm dependencies, Playwright Chromium, and `ffmpeg` with
`ffprobe` on your PATH.

```bash
npx playwright install chromium
npm run dev
```

With the app running, use a second terminal:

```bash
node demo-materials/capture.mjs
```

Pass the app URL as an argument if Vite uses a different port. The script uses
a clean browser context and the existing example, with compacted positions for
the recording. It selects Halloween through the app's Appearance dialog and
drives the canvas through its visible controls.

The script replaces `halloween-demo.gif`. Raw video, lossless frames, and
checkpoint screenshots go to a temporary directory printed at completion.
Lossless frames keep the GIF's static background stable during compression.

## Individual product captures

The Halloween product set uses a fictional Harbor Notes support workflow with
Kiro, GitHub, database, assistant, security, and message icons. Node outlines
pulse and connection dashes animate using the app's native animation presets.

| Use case | Screenshots | Animation | Video |
| --- | --- | --- | --- |
| Drill down and back up | [Overview](screenshots/01-drill-overview.png), [level 1](screenshots/02-drill-level-1.png), [level 2](screenshots/03-drill-level-2.png), [back to overview](screenshots/04-drill-up-overview.png) | [Drill levels](gif/01-drill-levels.gif) | [MP4](videos/01-drill-levels.mp4) |
| Diagram linked to wiki pages | [Agent design](screenshots/05-diagram-linked-wiki.png), [second linked page](screenshots/06-wiki-second-linked-page.png) | [Open and switch pages](gif/02-linked-wiki.gif) | [MP4](videos/02-linked-wiki.mp4) |
| Diagram linked to a slide deck | [Linked deck beside diagram](screenshots/07-diagram-linked-slides.png), [deck window](screenshots/08-linked-deck-window.png) | [Open the deck](gif/03-linked-slides.gif) | [MP4](videos/03-linked-slides.mp4) |
| Export an animated diagram | [Export action](screenshots/09-export-animated-gif.png), [completed canvas](screenshots/10-export-completed.png) | [Actual downloaded diagram GIF](gif/04-exported-diagram.gif) | |

Screenshots are 1600 × 1000. Walkthrough GIFs are 1280 × 800. The fourth GIF is
created by **More actions → Export GIF** in the running app and is saved directly
from the browser download. It is separate from the recorded walkthroughs.

### Recreate the product set

With the dev server running:

```bash
node demo-materials/scripts/capture-showcase.mjs
```

An optional URL argument selects a different server. To recreate one use case:

```bash
CAPTURE_CASE=02 node demo-materials/scripts/capture-showcase.mjs
```

Use `01`, `02`, `03`, or `04`. Run captures sequentially. The script produces
lossless source frames in a temporary directory and encodes GIFs and MP4s with
FFmpeg. Walkthrough timing is compressed to at most 24 seconds. The original
`halloween-demo.gif` and its capture script remain available above.

The reusable [workspace fixture](fixtures/halloween.marmerlade.json) includes all
nodes, linked pages, and the four-slide deck. For manual use, choose Halloween
in Appearance **before** importing the workspace. Appearance is a browser setting
and is separate from the imported file.

### Capture notes

Persona: a developer explaining an AI support system to teammates.

Problem: a single detailed diagram is difficult to explain, and supporting
notes and presentations are often separate from the architecture.

Workflow: start with the folded overview, unfold retrieval and then hybrid
search, fold back up, open two wiki pages linked to Kiro, open Kiro's linked
deck, and export the animated expanded diagram.

Value: readers can choose the level of detail, follow linked explanations, and
share an animation of the same canvas.

The fixture uses fictional content only. Captures run in clean browser contexts.
The minimap and automatic style inspector are hidden with capture-only CSS to
keep the diagram and documents unobstructed. The GIF exporter snapshots SVG drawing properties instead of copying all CSS
properties into each SVG path. Native Halloween styling, document panels,
links, and animations remain active.
The document captures use a compact arrangement of the same folded graph.

The script checks every canvas capture for clipped nodes, overlapping unrelated
nodes or group sheets, and toolbar collisions. Ancestor sheets may contain their
own descendants. Checkpoint geometry, browser errors, and download metadata are
saved in `notes/capture-evidence*.json`.

## Xray DIR agent acceptance

The [local agent-to-MCP test report](xray-dir-agent-e2e-run2/README.md) covers
source research, setup, a connected workspace, individual captures, native GIF
export, and browser navigation for Xray's data inaccuracy report workflow.
