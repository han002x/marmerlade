# Development

[Back to the README](../README.md) · [Design requirements](../DESIGN.md) · [Data model](../ONTOLOGY.md)

## Setup

Use Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints, normally http://localhost:5173.

## Checks

```bash
npm run lint
npm test
npm run test:mcp
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:mcp:integration
npm run test:native
```

`npm test` checks Mermaid round trips, folding, flow playback, wiki pages, slides,
and the editor. It also checks exported diagrams against the real Mermaid parser.
`npm run test:mcp` checks workspace behavior; the integration check needs a built
app and Playwright's Chromium. Browser tests cover the editor, slides, appearance,
and docs. `test:native` verifies idempotent project setup, existing host settings,
isolated previews, measured layout, image import, and asynchronous GIF jobs.
Both integration scripts accept a built CLI path to test a clean package install.

`npm run test:agent -- /absolute/new-output-directory /path/to/xray` runs two
real Codex CLI sessions using the built package. The setup session installs the
project skills and MCP configuration. A fresh authoring session then researches
Xray's DIR implementation and creates a linked workspace through MCP, including
native previews, image import, and GIF export. The runner inherits the configured
Codex model and authentication, disables unrelated MCP servers for these sessions,
and leaves global configuration unchanged. It requires an authenticated `codex`
CLI, a build, Chromium, and local `xray-api` and `xray-web` checkouts. Output
includes the prompts, JSONL tool traces, source commit IDs, and the editable
project. The runner checks required tool calls and unchanged Xray git state;
an independent review must still assess source accuracy and rendered artifacts.
Use `npm run test:agent -- --continue /absolute/existing-output-directory /path/to/xray`
to finish an interrupted run from its saved project and trace. The new agent
reopens the workspace and requests new render jobs instead of reusing expired IDs.

Other useful commands:

| Command | Purpose |
| --- | --- |
| `npm run preview` | Serve the production browser build locally. |
| `npm run icons` | Regenerate `src/icons/catalog.ts` from the curated list in `scripts/icons.ts`. |
| `npm pack --dry-run` | Inspect the npm package contents. The prepack hook builds the app. |
| `npm pack` | Build and create the npm tarball. |

## Architecture

| File | Role |
| --- | --- |
| [src/types.ts](../src/types.ts) | `Diagram` data model: flat nodes + edges, `parentId` for nesting, `collapsed` flag |
| [src/store.ts](../src/store.ts) | Zustand store + mutations; `hiddenNodeIds()` derives what a collapse hides |
| [src/mermaid/io.ts](../src/mermaid/io.ts) | `fromMermaid` / `toMermaid` parse and emit the flowchart subset (subgraphs ↔ groups) |
| [src/fold.ts](../src/fold.ts) | Pure fold logic: hidden set, edge creases, fold levels, sheet geometry |
| [src/flow.ts](../src/flow.ts) | Pure flow schedule: which step each visible connection plays in |
| [src/flowPlayer.ts](../src/flowPlayer.ts) | Flow clock (`--mf-flow-t`), play / pause / step / speed |
| [src/foldMotion.ts](../src/foldMotion.ts) | Fold / unfold choreography; commits one undo step per fold |
| [src/layout.ts](../src/layout.ts) | Dagre auto-layout over the visible graph; unfolded groups are clusters so sheets don't overlap |
| [src/theme.ts](../src/theme.ts) | Theme store: OS default, `localStorage` persistence, `<html data-theme>` flip |
| [src/persist.ts](../src/persist.ts) | Diagram autosave/restore + `.marmerlade.json` export/import |
| [src/components/DiagramNode.tsx](../src/components/DiagramNode.tsx) | Custom React Flow node: shapes, inline rename, folded-card tab |
| [src/components/SheetNode.tsx](../src/components/SheetNode.tsx) | Paper sheet behind an unfolded group, with the dog-ear fold control |
| [src/components/Icon.tsx](../src/components/Icon.tsx) | Inline-SVG icon set (currentColor, theme-aware) |
| [src/pages.ts](../src/pages.ts) | Pure wiki logic: lazy pages, shared links, migration, wikilinks, backlinks, orphans, embed subtree, cross-window merge |
| [src/slides.ts](../src/slides.ts) | Pure deck logic: split slides, speaker notes, Marp / Slidev Markdown export |
| [src/slides/](../src/slides/) | Lazy-loaded slides window: `SlidesApp` (source beside slides), `Slide`, `Present` |
| [src/route.ts](../src/route.ts) | Hash routes (`#/wiki/<id>`, `#/slides/<id>`, `#/node/<id>`) and window helpers |
| [src/dock.ts](../src/dock.ts) | Which view the side panel shows; `showPage` opens a node's page there |
| [src/components/PagePanel.tsx](../src/components/PagePanel.tsx) | Page tab: edit / read the selected node's page beside the canvas |
| [src/components/SlidesPanel.tsx](../src/components/SlidesPanel.tsx) | Slides tab: the selected node's deck as slides or Markdown beside the canvas |
| [src/wiki/](../src/wiki/) | Lazy-loaded wiki window: `WikiApp`, rich-text `Editor`, CodeMirror `SourceEditor`, sanitized `Preview`, `render` |
| [src/useHotkeys.ts](../src/useHotkeys.ts) | Global keyboard shortcuts, suspended while typing |
| [src/components/MermaidPanel.tsx](../src/components/MermaidPanel.tsx) | Live Mermaid text view + import/copy |
| [src/App.tsx](../src/App.tsx) | Canvas wiring, toolbar, visibility filtering |

The live workspace adds these modules:

| File | Role |
| --- | --- |
| [server/cli.ts](../server/cli.ts) | CLI entry point, MCP tools and resources |
| [server/workspace.ts](../server/workspace.ts) | Workspace mutations, revisions, file locking and atomic saves |
| [server/http.ts](../server/http.ts) | Local browser server and live workspace connection |
| [src/liveWorkspace.ts](../src/liveWorkspace.ts) | Browser connection and synchronization with the server workspace |
| [src/workspaceSchema.ts](../src/workspaceSchema.ts) | Workspace and change validation |

## Package verification

The integration check accepts an optional CLI path, so it can test a clean
installation of the npm tarball:

```bash
node scripts/mcp-integration.mjs /path/to/install/node_modules/marmerlade/dist/cli.js
```

Publish the verified tarball only after confirming npm name ownership and access.
