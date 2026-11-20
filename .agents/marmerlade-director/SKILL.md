---
name: marmerlade-director
description: Direct a Marmerlade project from its brief through diagrams, linked wiki pages, optional slides, verification, and handoff. Use when asked to create, organize, explain, or present a connected Marmerlade workspace.
---

# Marmerlade director

The process for a directed Marmerlade project. Procedural on purpose: each step
says what to do, which tool does the mechanical part, and what "done" means.
Run the steps relevant to the requested outcome. Reuse completed work when
continuing an existing project.

Use [marmerlade-docs](../marmerlade-docs/SKILL.md) for entity fields, formats,
link syntax, and editing contracts. The director chooses the content and order
of work; the docs skill describes what the product can represent.

## 1. Establish the brief

**Do:** Identify the audience, the question they need answered, the source
material, and the requested deliverables. Inspect existing project material
before asking for missing context. Record a short brief in the working plan;
create a separate brief file only when a saved plan or handoff needs it.

Choose the smallest useful set of artifacts:

| Reader's task | Artifact | What belongs there |
| --- | --- | --- |
| Understand how parts connect, contain, or affect each other | Diagram | Structure, flows, dependencies, decision paths |
| Look up an explanation and return to it later | Wiki page | Meaning, rationale, requirements, procedures, examples, references |
| Follow an explanation toward an understanding, decision, or action | Slides | An audience-specific sequence of messages and evidence |

**Mechanics:** Read the user's sources with the available file/search tools;
use `get_workspace` to inspect an existing Marmerlade project. Tool names may
have an MCP server prefix; discover their registered names before calling them.

**Done:** The intended reader, question, evidence, and artifact set are explicit.
Unresolved assumptions are identified. A wiki page per node and a slide deck
per project are not automatic requirements.

Discuss who starts each key workflow, its inputs, important decisions, successful
result, and relevant failure or handoff paths. Ask a small batch of questions
when the sources cannot establish these. Reflect the proposed workflow back to
the user before building a large model, while continuing useful source review.

## 2. Establish the editing context

**Do:** Read the existing workspace and preserve unrelated content. Choose live
MCP editing or an offline `.marmerlade.json` deliverable according to the user's
environment and request. Keep stable IDs for existing entities.

**Mechanics:** For a connected server, call `get_workspace` and retain its
`revision`, `diagram`, `file`, and `url`. Read `marmerlade://guide` when available
or the relevant references in the docs skill. For offline work, read the file
and validate it with `parseDiagram` as described in the docs skill. The ordinary
browser app's localStorage and an MCP workspace are separate stores.

**Done:** The target workspace, current contents, editing method, and destination
are known. Do not write the JSON file externally while its MCP server owns it.
If MCP is unavailable, do useful offline work where it satisfies the request;
identify the missing connection when live editing is required.

For first-run setup, use [marmerlade-setup](../marmerlade-setup/SKILL.md) and
check `diagnose_environment` after connecting. Discover the host's existing
image-generation capability separately; Marmerlade does not supply an image
model or provider credentials.

## 3. Model the explanation

**Do:** Identify the entities, activities, decisions, and meaningful connections.
Separate overview from detail with groups. Use short labels and label an edge
when its relationship would otherwise be ambiguous. Choose a useful starting
fold state. Retain factual uncertainty instead of inventing system behavior.

Plan supporting documents by reader question. Link a shared policy or contract
to several nodes when appropriate. Link a deck to the system or subject it
explains rather than creating one for each leaf.

**Mechanics:** Map the structure to node IDs, `parentId`, edge endpoints,
`pageIds`, and `deckIds`. Sketch in Mermaid when that is convenient, or prepare
JSON entities directly. Consult the docs skill before using an unfamiliar shape,
icon, embed, or slide feature.

**Done:** Each node and connection has a purpose. The overview is understandable
without opening every group. Document topics and their attachment points are
chosen. The model does not duplicate the same entity merely to fit a layout.

## 4. Build the diagram

**Do:** Create or update the structural model. Add relevant icons and restrained
styling where they help readers recognize roles. Use icons from the actual
catalog; unsupported IDs render as placeholders. Honor the requested theme
without making a past project's theme a default for every project.

**Mechanics:** Use `apply_changes` with the latest revision and complete
`put_node` / `put_edge` values. Include newly referenced documents in the same
atomic batch. Puts replace whole entities, so retain existing fields that must
survive. Use `import_mermaid` only when replacing the diagram's entire structure
is intended; `tidy` defaults to true. It is not an incremental add-nodes tool.
For an offline deliverable, write a version-4 envelope when including sequence source or version 3 for a flowchart-only workspace, then validate it.

**Done:** Read back the committed workspace. IDs, parents, endpoints, and document
references resolve. Requested structure exists and unrelated content remains.
Use the returned revision for the next edit. On conflict, reread and reconcile
the intended change instead of resending a stale batch.

Use `list_icons` for recognized icon IDs. For artwork, use the host's existing
image skill/tool, copy final images into the project's assets directory, then
call `import_image` with the latest revision and an existing target node. It
normalizes and embeds the image, retains the original, and returns a new
revision. Image paths must be within the workspace file's project directory.
If no image provider exists, report that capability gap and continue with
supplied assets and editable diagrams.

## 5. Add the wiki explanation

**Do:** Write pages for the details a reader needs beyond a diagram label. Cover
purpose, behavior, rationale, constraints, or procedures as the topic requires.
Keep related topics discoverable through wikilinks. Reuse existing pages before
creating overlapping explanations.

**Mechanics:** Use `put_page` with `{id, title, body}`; MCP assigns `updatedAt`.
Update the relevant nodes' `pageIds` through complete `put_node` values. Use
`[[Page title]]` for wiki links. Use `{{diagram:node_id}}` for a stable, explicit
diagram target; use bare `{{diagram}}` when the page should follow its current
linked-node context. Skip this step when the request needs no reference pages.

**Done:** Inspect new or changed pages with `render_preview`, `view: "wiki"`,
and the page ID. Use `open_workspace` for the user's local view. Check its
attachment, links, and embeds. Avoid duplicate page titles that make link
resolution ambiguous. A valid Markdown string alone does not prove readability.

## 6. Direct the presentation, when needed

**Do:** Build slides only when requested or when the brief establishes a
presentation need. Decide the audience's intended takeaway before ordering the
slides. Give each slide a main message; keep detailed reference material in the
wiki. Use speaker notes for narration and explicit diagram embeds for context.

**Mechanics:** Use `put_deck` with `{id, title, body}` and update node `deckIds`.
Write slide breaks as `---` on their own line, with blank lines around the
break. Use `render_preview` with `view: "slides"`, the deck ID, and each slide
number to inspect Present view. Use `open_workspace` for the user's local view
and the docs skill for
front matter, directives, notes, and objects.

**Done:** The deck has a coherent sequence and a clear outcome. Text and diagrams
are legible in presentation view. Embeds target the intended scope and wiki
links resolve. The deck summarizes the supporting material consistently.

## 7. Verify the connected experience

**Do:** Inspect the artifact as its reader will use it. Check the overview, each
authored level of detail, representative mixed fold states, wiki navigation,
and any deck. Verify that folded connections still convey the intended flow.
Review prose after structural changes; live embeds update, authored explanations
do not rewrite themselves.

**Mechanics:** Use `layout_diagram` to measure rendered labels and arrange the
expanded graph while preserving saved folds. Inspect isolated `render_preview`
snapshots with `fold: "current"`, `"expanded"`, or `"collapsed"` and the intended
appearance. Check the returned image and overlap, clipping, small-label,
image-load, browser-error, and slide-overflow diagnostics. Long graphs may need
another direction, folding, or focused explanations for readable labels.
Preview options do not change the live workspace. Persist intended fold state
through `apply_changes`. Auto-layout still needs visual inspection.

**Done:** Labels are readable, unrelated nodes and group sheets do not overlap,
content stays in frame, and linked views show the expected material. Select
Appearance before final per-element styling because changing the preset resets
existing visual overrides. If visual tooling is unavailable, identify the
specific unverified views and complete the checks that are possible.

## 8. Package the requested result

**Do:** Deliver the editable workspace and any requested presentation exports,
screenshots, or animations. Choose export formats according to what must survive.
Capture separate use cases when the brief calls for them, with consistent framing
and meaningful filenames. Keep synthetic examples separate from factual claims.

**Mechanics:** Use the MCP workspace's saved JSON or the browser's Export file
for the complete editable project. `export_mermaid` carries structure and
document references, not document bodies or styling. Use the slide window's
Export Markdown or print from Present view for PDF. Use `export_gif` for native
animation and poll `get_render_job` until complete or failed. The export pins
the requested revision. Previews and exports are saved in `marmerlade-output/`
beside the workspace file. Browser automation and FFmpeg
can produce walkthrough recordings when those are requested. Do not label a
screen recording as a native diagram export.

**Done:** Reopen the saved workspace, check exported files, and play animations
through a loop. Provide artifact locations, a short explanation of what changed,
and the checks performed. State any remaining limitations. Exporting a file does
not itself authorize publishing or distributing it.
