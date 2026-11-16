# Xray DIR agent-to-MCP acceptance test

Passed locally on 15 November 2026, with one rendering fix and a resumed agent
session. The finished app is running at [localhost:39133](http://127.0.0.1:39133/#/).
The browser-open command was issued. This confirms the local service and request,
not visibility of a desktop window.

## Deliverables

- [Editable workspace](project/xray-dir.marmerlade.json), with 26 nodes, 18 edges,
  eight wiki pages, and a five-slide deck.
- [Native animated GIF](project/marmerlade-output/diagram-c03134d6-12e2-49eb-9d8b-7b97f7ab7d09.gif),
  1200×1200, 28 frames, seven seconds, and an infinite loop.
- [Individual native captures and diagnostics](agent/artifacts.json), including
  all fold states, two mixed views, every wiki page, and every slide.
- [Browser screenshots](ui-audit/01-saved-starting-view.png),
  [drill-down](ui-audit/02-drill-down.png),
  [diagram linked to wiki](ui-audit/03-diagram-linked-wiki.png), and
  [diagram linked to slides](ui-audit/05-diagram-linked-slides.png).
- [Agent completion report](agent/completion-report.md),
  [source-grounding report](agent/source-grounding-report.md), and
  [independent source review](independent-source-review.md).

The native captures and GIF use Halloween appearance. Kiro is identified as an
authoring tool, outside the Xray processing path. The imported globe is generic
public artwork, and its original file is retained. Appearance is a browser
setting; select Halloween in the live app's Appearance dialog if needed.

## What ran

A real Codex setup session read the setup skill, configured the isolated project,
and passed runtime and child-MCP checks. A second setup changed no installed files
or configuration. The test reused Node 24.13.1 and the existing Chromium installation.

A fresh Codex session loaded the project MCP configuration and used the director
and docs skills to inspect Xray's plans, spec, UI, API, services, and workbook code.
It authored content through Marmerlade MCP. Its execution process ended before
handoff, so a continuation session reopened the saved file and completed the run.
The traces record 88 MCP calls across all 11 tool types needed for this workflow.
Workspace content and stable IDs survived the restart.

The source review identifies v3 as the current six-stage workflow. It distinguishes
current baseline selection and the Stage 5 audit from broader older plans. Grade E
compilation copies qualifying original geometry and preserves uploaded GeoCUP
grades and geometry.

## Verification

- All 18 final native previews have clear overlap, clipping, small-label,
  failed-image, browser-error, and overflow diagnostics. Images were also inspected.
- An independent audit verified 40 file hashes and sizes, 46 local source
  citations, wiki targets, and retention of the original image.
- All GIF frames decoded. Twenty-seven frames differ. The agent played the GIF
  in a browser beyond its seven-second loop.
- Independent browser checks on a separate copy unfolded and folded geometry,
  opened a node's wiki, followed a wikilink, opened the wiki window, opened the
  linked deck, and advanced the presentation. Diagram content and links remained
  intact. The tested copy matches the final authored content.
- A standalone server reopened the original saved file. Its live bootstrap data
  matches the file, and its HTTP endpoint returns 200. It remains running as PID
  161472. [Service details](local-app.json) and [log](local-app.log) are saved.
- Both Xray checkouts retain their original commit IDs and clean git state.

Machine-readable evidence is in [the artifact audit](independent-artifact-audit.json),
[content audit](independent-content-audit.json),
[UI audit](independent-ui-audit.json), and [GIF audit](independent-gif-audit.json).

## Finding and recovery

The agent caught a slide preview during its fade entrance even though diagnostics
were clear. Still captures now disable animations through Playwright, which
finishes finite animations before capture. Native GIF animation remains active.
The native integration suite passes, including a pixel comparison between static
and fade-transition slide text. Build, targeted lint, syntax checks, and
`git diff --check` pass.

Other recovered attempts included an oversized preview request, a GIF memory-budget
rejection, and incorrect browser-check locators. The agent reduced the export job,
checked the actual UI roles and popup behavior, and repeated the affected checks.
The first runner startup also exposed quoted MCP override keys that this Codex
CLI rejected. The runner now uses accepted keys. Earlier attempts remain recorded
in the [completion report](agent/completion-report.md).

The independent UI harness also needed the rendered link role, an HTTP-only
appearance initializer for blank popups, and a start that handles open groups.
These corrections changed the test harness, not the app.

## Scope and replay

This verifies local Codex-to-Marmerlade setup, authoring, rendering, exports, and
browser navigation. Xray behavior is source-derived. No Xray API, database,
customer workbook, migration, or GDB conversion ran. The host's image-generation
tool was discovered but was not called; image import used supplied artwork.
The session reused installed dependencies, so it does not represent a clean OS
bootstrap or a Kiro-host runtime test.

From the Merfolk checkout, run a new acceptance test with:

```bash
npm run test:agent -- /absolute/new-output-directory /home/han/projects/xray
```

To continue an interrupted run:

```bash
npm run test:agent -- --continue /absolute/existing-output-directory /home/han/projects/xray
```

The runner requires a built package, authenticated Codex CLI, Chromium, and local
Xray API and web checkouts. It preserves the configured model and authentication,
disables unrelated MCP services for the test sessions, and leaves global host
configuration unchanged. The project file permits one active server at a time.
The earlier agent-session URL in its report has expired; use the live URL above.
