# Live workspace contract

Discover the installed Marmerlade tool names; the client may prefix these names
with its server namespace. The current server exposes twelve tools and two
resources. Validate calls against that server's registered input schemas.

## Tools

| Tool | Input | Result or effect |
| --- | --- | --- |
| `get_workspace` | No arguments | `{revision, diagram, file, url}` |
| `apply_changes` | `{revision, changes}` | Atomically commits changes and returns `{revision, diagram}` |
| `import_mermaid` | `{revision, source, tidy?}` | Replaces structural content and returns a committed snapshot; `tidy` defaults true |
| `export_mermaid` | No arguments | `{source}` with Mermaid structure |
| `diagnose_environment` | `{probe?}` | Runtime checks and actionable failures; probe defaults true |
| `list_icons` | `{query?, group?, offset?, limit?}` | Supported icon IDs, names, groups, and pagination |
| `import_image` | `{revision, nodeId, path}` | Embed a normalized project image on an existing node; returns new revision and original path |
| `layout_diagram` | `{revision, direction?}` | Measure labels and arrange expanded graph; direction `TB` or `LR`, default `TB` |
| `render_preview` | `{revision, ...renderOptions}` | PNG image, local file, revision, and diagnostics |
| `export_gif` | `{revision, ...renderOptions, fps?, maxWidth?, flow?}` | Queues native GIF; returns `jobId` and pinned revision |
| `get_render_job` | `{jobId}` | Queued/running/complete/failed job status |
| `open_workspace` | `{view?, id?}` | Opens the requested view and returns `{url}`; `view` defaults to `canvas` |

`revision` is a nonnegative integer for the current server process. A successful
commit increments it. Use the revision from the latest snapshot; it is not the
saved file's version and does not persist across server restarts.

`changes` is a nonempty array. The generated
[changes schema](changes.schema.json) describes its input shape.

| Change kind | Payload field | Behavior |
| --- | --- | --- |
| `put_node` | `node` | Complete DiagramNode; replaces the entity with that ID |
| `put_edge` | `edge` | Complete DiagramEdge; replaces the entity with that ID |
| `put_page` | `document` | `{id, title, body}`; server assigns `updatedAt` |
| `put_deck` | `document` | `{id, title, body}`; server assigns `updatedAt` |
| `delete_node` | `id` | Removes node, descendants, and their incident edges; retains documents |
| `delete_edge` | `id` | Removes that edge |
| `delete_page` | `id` | Removes page and unlinks it from all nodes |
| `delete_deck` | `id` | Removes deck and unlinks it from all nodes |

For example, after reading revision 7, update an existing page with:

```json
{
  "revision": 7,
  "changes": [
    {
      "kind": "put_page",
      "document": {
        "id": "overview",
        "title": "Platform",
        "body": "# Platform\n\n{{diagram:platform}}\n\nThe API queries the database."
      }
    }
  ]
}
```

Replace the example revision with the actual latest value. Node and edge puts
are replacements, not patches. Read and retain fields such as document links,
styles, parent, and position when changing only a label. Put related documents,
nodes, and edges in the same batch so the resulting graph has no missing
references. Changes apply in array order and the final diagram is validated
before saving. A failed batch does not commit a partial workspace.

On revision conflict, call `get_workspace`, compare current entities with the
intended change, and create a reconciled batch. Do not blindly retry a stale
replacement. If the user or another writer changed the same meaning in a way
that cannot be reconciled, report that specific conflict.

`import_mermaid` replaces nodes and edges with the parsed structure while
preserving existing document collections and mergeable visual state. Newly
referenced pages/decks get empty documents. `tidy: true` repositions nodes; it
does not preserve authored geometry. Use `apply_changes` for incremental edits.

`open_workspace` accepts `canvas`, `node`, `wiki`, or `slides`. `node` requires
an ID; omitted wiki/slide IDs open their indexes. Opening a view does not
capture a screenshot or verify content. Layout, folds, appearance, presentation,
and custom walkthrough recordings can also use browser controls. Native
`layout_diagram`, `render_preview`, and `export_gif` run isolated browser contexts.

## Native media options

Preview/export options are `view` (`canvas`, `wiki`, `slides`; default canvas),
`id` for a wiki page or deck, optional `nodeId` for document context, `slide`
(one-based, default 1), `fold` (`current`, `expanded`, `collapsed`; default
current), `appearance` (an installed preset ID, default paper), and `width` /
`height` (default 1440 / 1000, bounds 640-2400 / 480-1800). Document views require
an existing document ID. These options affect isolated renders, not saved state
or the user's browser settings. Layout measures in the default Paper appearance;
inspect the intended appearance afterwards.

`render_preview` returns PNG image content plus text metadata. Diagnostics include
`overlaps`, `clipped`, `smallLabels`, `failedImages`, `errors`, and
`contentOverflow`. A zero-error parse does not prove readability; inspect the
image and respond to these diagnostics. Wiki previews use Read mode, slide
previews use Present view. Native rendering does not save back to the workspace.

GIF export only supports `view: "canvas"`. `fps` is 1-24, default 12;
`maxWidth` is 320-1600, default 900. `flow: true` includes the sequenced flow;
otherwise node and edge motion presets still animate. Exports are limited to
30-second animation cycles, a 64-million output-pixel frame budget, and a
three-minute capture deadline. Reduce frame rate or output width for longer flows. Keep polling
`get_render_job` until `complete` or `failed`; do not assume the initial reply is
a finished file. Completed jobs include `file` and `bytes`, failed jobs include
`error`, and running jobs include `progress` from 0 to 1. Jobs belong to the
current server process; closing it cancels unfinished work. At most four render
operations can be queued or running; inspect existing jobs before retrying a
full queue. Up to 100 recent job results are retained alongside active work.

Previews and GIFs use unique filenames under `marmerlade-output/` beside the
workspace file. Image import accepts readable files inside that project directory
and rejects symlinks escaping it. Supported inputs are PNG, JPEG, WebP, GIF, SVG,
and AVIF, up to 10 MiB before processing. The original remains unchanged. The app
normalizes raster images to a maximum 512-pixel side and caps an embedded image
at 200,000 data-URI characters; display size has a 128-pixel longest side by
default. SVG remains vector data. A GIF imported as an image is normalized as a
static raster; diagram animation is stored separately on nodes and edges.

`import_image` and `layout_diagram` check the revision again at commit after their
browser work. A concurrent edit can cause a conflict; reread before retrying.
Read-only previews and GIF jobs pin a snapshot and may finish after a newer
revision exists. They report the revision they actually rendered.

## Resources

- `marmerlade://guide` contains the installed document-model guide.
- `marmerlade://example` contains a complete linked workspace example.

Read these through the connected MCP resource mechanism when available. They
are resource URIs, not HTTP URLs or local file paths.

## Workspace and browser boundaries

The CLI is `node dist/cli.js --file /absolute/path/project.marmerlade.json` in
a built checkout. It serves a live browser canvas and MCP over stdio. Launching
it in a terminal does not register it with the assistant. Use `docs/mcp.md` for
client connection setup. Do not assume an npm release exists from a local
package name.

One server process owns a file through a lock. Edits commit through an atomic
file replacement. Do not edit the file directly, remove its active lock, or
start another writer against it. A server-backed browser window and the regular
dev app's localStorage are separate workspaces. Use an exported JSON file to
transfer existing browser work into a server workspace.

Disconnected or conflicting browser windows retain drafts. Preserve a draft
before reloading or discarding it. Remote updates reset browser undo history;
the revision protocol prevents undo from overwriting newer remote state.

## Routes

Routes are hash fragments appended to the workspace URL:

| Route | View |
| --- | --- |
| `#/` | Canvas |
| `#/node/<nodeId>` | Reveal and frame a node, unfolding its ancestors |
| `#/wiki` | Wiki index |
| `#/wiki/<pageId>?node=<nodeId>` | Wiki page with optional linked-node context |
| `#/slides` | Deck index |
| `#/slides/<deckId>?node=<nodeId>` | Deck editor with optional node context |
| `#/slides/<deckId>?node=<nodeId>&slide=2` | Present slide 2; slide numbers start at 1 |
| `#/slides/<deckId>?slide=2&presenter=1` | Presenter view |
| `#/docs` | Product ontology guide |

URL-encode IDs. Do not add file version or MCP revision to these routes.
