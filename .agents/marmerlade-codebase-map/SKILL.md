---
name: marmerlade-codebase-map
description: Map a codebase into a foldable Marmerlade diagram with wiki pages, or refresh an existing map after the code changed. Use when asked to explain, document, or visualize a repository's architecture.
---

# Marmerlade codebase map

Turn a repository into an overview that folds into detail. Use
[marmerlade-director](../marmerlade-director/SKILL.md) for briefs, slides, and
packaging, and [marmerlade-docs](../marmerlade-docs/SKILL.md) for entity fields
and formats. This skill covers only reading code and shaping it into a diagram.

## 1. Scan, do not read everything

Read the manifest, entry points, top-level directories, and any existing
architecture notes. Open a file only to answer a question the diagram needs:
what a module owns, who calls it, where data enters and leaves. Note the file
paths you relied on; they go in wiki pages, not labels.

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

1. Put groups and leaves in one batch, then edges. Use `dryRun: true` first and fix any error.
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

The overview fits one screen with groups folded. Each group opens to its modules.
Every edge traces to code you read. Wiki pages name their source files. Preview
diagnostics are clean, or the remaining ones are stated.
