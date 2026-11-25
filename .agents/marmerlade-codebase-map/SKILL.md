---
name: marmerlade-codebase-map
description: Explain an entire repository through a reader-facing Marmerlade README deck, overview diagram, and linked details, or refresh an existing codebase map. Use for one-prompt repository walkthroughs, documentation, and architecture maps.
---

# Marmerlade codebase map

Turn a repository into an overview that folds into detail. Use
[marmerlade-director](../marmerlade-director/SKILL.md) for briefs, slides, and
packaging, and [marmerlade-docs](../marmerlade-docs/SKILL.md) for entity fields
and formats. For an entire-repository explanation, inspect the repository and
propose a connected workspace without requiring the user to prescribe each
artifact. Obtain approval of the brief through the director's propose, approve,
generate step before creating the workspace. Treat the agent as a presenter
guiding a reader, not as a file inventory generator.

## Repository walkthrough entry point

Start the reader's experience with exactly one clearly named **README** deck
and one overview diagram. Reuse and update existing equivalents when possible.
The deck introduces the repository's purpose and audience, key functionalities,
and the main architecture or workflow; explain what the reader is looking at
and why it matters, with concise slides and speaker notes. Include an overview
diagram embed and a final navigation slide linking to the relevant detailed
decks, wiki pages, and diagrams using the supported link syntax. Do not create
links to material that does not exist.

Build the overview diagram as the reader's map of the system, with meaningful
groups and verified relationships. Attach the README deck and an overview wiki
page to an appropriate entry node so they are discoverable. The page can act as
a reference index with links to the README deck and deeper material. Create
focused wiki pages and, where useful, detailed decks or diagrams for major
functionalities and flows; connect them from the entry point and to their
corresponding nodes. Explain evidence, key source paths, and uncertainty in the
wiki. Base the walkthrough on the complete repository review described below;
report any unread material and its effect on coverage.

Organize the wiki into reader-facing folders for the major topics and flows,
with the overview page easy to find at the top level. Choose names and nesting
that fit the repository; do not reproduce its directory tree mechanically.
Use the overview's links to suggest a reading path across folders. Reuse the
existing hierarchy on refresh and preserve unrelated content. Follow the
director's wiki step for folder editing and verification.

Discover the registered Marmerlade MCP tools, inspect the workspace and guide,
then build and verify the connected artifacts using the workflow below and the
director's presentation and verification steps. Preserve unrelated workspace
content. If MCP is unavailable, report the limitation and provide an offline
workspace only when that satisfies the request; do not claim live delivery.

## Open the finished walkthrough

After verification, leave the saved workspace running in Marmerlade for the
reader. If the connected MCP server will remain alive, use `open_workspace` to
open the README deck and report its actual URL and port. Verify the URL is
reachable. Do not start a second server for the same file: the workspace has a
single owner.

If the MCP connection was temporary and will close, close it first to release
the file, then start a persistent `marmerlade serve --file <absolute-workspace>`
process (or `node <absolute-cli>/dist/cli.js serve --file <absolute-workspace>`
from a built checkout). Capture its actual URL from its output, verify it is
reachable, and leave the process running. Use `--open` when the browser runs on
the user's machine; otherwise explain any remote-host access limitation. Never
report the temporary server's stale port. Include the workspace file and a
restart command in the handoff. If launching fails or the environment cannot
keep a process alive, say so and provide the command instead of claiming it is
running.

## 1. Read the repository and synthesize

For an entire-repository walkthrough, inventory the repository, including
hidden project files, and read all accessible, human-authored source, tests,
configuration, scripts, and documentation. Work in manageable batches; keep a
coverage record and notes so that large repositories do not silently lose
modules to context limits. Trace entry points, major user journeys, data flow,
dependencies, configuration, persistence, build and test paths across files.
Use tests as evidence of intended behavior, and distinguish that from behavior
confirmed in implementation. Reconcile conflicting documentation with source.

Identify generated output, dependency trees, lockfiles, binaries, media, and
secrets or credentials during inventory. Inspect their role and relevant
metadata or manifests as needed; do not dump binary data, expose secrets, or
treat duplicated generated/vendor content as independent authored source.
Record exclusions, unreadable files, and any limits honestly. Never claim a
complete read if review was partial. For a scoped refresh, inspect the affected
code and its callers, dependencies, and existing explanation; expand the review
when a change affects the whole system.

Synthesize the evidence into a clear explanation for the intended reader:
what the product does, its key functionality, how the parts and important
flows fit together, where to find details, and any material uncertainty. Group
related facts by reader question rather than file order. Use concise prose,
concrete terminology, and useful examples; omit incidental implementation
details from the overview. Put supporting source paths and deeper behavior in
wiki pages, and explain implications instead of merely listing files. Ensure
every significant subsystem and user-facing capability has a place in the
overview or linked detail, without creating a node for every file.

Call `get_workspace` and keep its `revision`. If the workspace already has
nodes, follow section 5 instead of rebuilding.

## 2. Design the levels

- Top level: 3 to 6 groups that match how the team talks about the system
  (for example client, server, storage, tooling), not the directory listing.
- Second level: the modules inside each group. Keep a group under about 12
  children; split it when it grows past that.
- A leaf is one module, service, store, or external system. Do not map every file.
- Fold groups at the top level (`collapsed: true`) so the first view is the overview.
- Label with the name a developer would say. Put the path in the wiki page.

IDs: node IDs match `^[A-Za-z0-9_]+$`, so use `mod_server_http`, not paths with
slashes. Page and deck IDs also allow `-`. Keep IDs stable between runs; refresh
depends on them.

## 3. Draw only edges the code shows

Add an edge for an import, call, message, or data flow you saw in source. Label
an edge when its meaning is not obvious (`queries`, `publishes`). Do not infer
runtime behavior from names. Record uncertainty in the wiki page, for example
"Not confirmed: whether the worker retries."

## 4. Build in small checked batches

1. Put groups and leaves in one batch, then edges. Include referenced documents in the same batch. Use `dryRun: true` first and fix any error.
2. Commit with the revision from the last result. Use the returned revision next.
3. Add wiki pages and set the owning nodes' `pageIds` in a second batch. A page per group is
   usually enough; add leaf pages only for modules that need explaining.
4. Run `layout_diagram`, then `render_preview` with `fold: "collapsed"` and
   `fold: "expanded"`. Act on `overlaps`, `clipped`, `smallLabels`, and `failedImages`.

A wiki page covers purpose, responsibilities, key files, and what it depends on.
Embed the group with `{{diagram:<node_id>}}`. Link neighbors with `[[Title]]`.

## 5. Refresh an existing map

1. Read the workspace and the changed code (use `git diff --stat` or the user's scope).
2. Match code to nodes by ID. Do not rename an ID to change its label.
3. Put only entities whose meaning changed. A put replaces the whole entity, so start
   from the node you read and change only the needed fields. This keeps position, fold,
   style, and links.
4. Add nodes and edges for new modules. Delete a node only when the module is gone;
   `delete_node` removes its subtree and edges but keeps pages, so update or delete
   the page too.
5. Update the affected wiki prose. Embeds update on their own; written explanations do not.
6. Dry-run, commit, then `render_preview` the changed groups.

On a revision conflict, call `get_workspace`, reconcile with what changed, and send a new batch.

## Done

For a repository walkthrough, the README deck leads the reader from purpose and
key functionality to the overview diagram and existing detailed resources.
Check the actual links, attachments, slides, and embeds in preview. The overview
fits one screen with groups folded. Each group opens to its modules.
Coverage accounts for the repository inventory and states any exclusions or
unread material. Each major capability is explained in the overview or linked
detail. Every edge traces to code you read. Wiki pages name their source files. Preview
diagnostics are clean, or the remaining ones are stated. The saved wiki sidebar
groups the detailed pages by topic, or the folder-editing limitation is reported.
