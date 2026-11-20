---
name: marmerlade-docs
description: Explain, author, validate, or update documentation for Marmerlade's ontology and formats, including workspace JSON, Mermaid, wiki and slide Markdown, and MCP changes. Use for schema questions, imports, exports, conversions, and format compatibility.
---

# Marmerlade docs

The format reference for agents working with Marmerlade. Use the
[director](../marmerlade-director/SKILL.md) for project sequencing and artifact
selection. This skill describes entities, syntax, validation, and portability.

## Read only what the task needs

| Task | Reference |
| --- | --- |
| Model entities, nesting, links, styles, or a saved workspace | [Ontology](references/ontology.md) |
| Write or convert Mermaid, wiki pages, or slide decks; understand export loss | [Formats](references/formats.md) |
| Edit a connected workspace or diagnose an editing conflict | [MCP contract](references/mcp.md) |
| Inspect a complete small workspace | [Linked example](references/example.marmerlade.json) |
| Validate workspace JSON syntax and field constraints | [Workspace JSON Schema](references/workspace.schema.json) |
| Validate an `apply_changes` request's structure | [Changes JSON Schema](references/changes.schema.json) |
| Validate native preview and GIF requests | [Preview schema](references/preview.schema.json), [GIF schema](references/gif.schema.json) |

The JSON Schemas are generated from the runtime Zod definitions. They describe
input structure, not every semantic constraint. `parseDiagram` also checks
relationships after normalization. Schema validation cannot prove that a layout
is readable, a wikilink resolves, or a slide fits.

## Essential rules

- Use version 4 when the diagram includes a `sequence` string with Mermaid sequence source.
- Save a flowchart-only workspace as `{ "version": 3, "diagram": { "nodes": [], "edges": [], "pages": [], "decks": [] } }`.
- Groups are ordinary nodes referenced by other nodes' `parentId`. There is no
  stored `children` array or group discriminator.
- Node `pageIds` and `deckIds` are ordered many-to-many links. The first is the
  default. Pages and decks are independent of nodes and have separate namespaces.
- The complete workspace, Mermaid structure, Markdown document bodies, and
  rendered exports carry different information. Choose the format deliberately.
- For live editing, read the revision before mutation. Puts replace full entities;
  document puts omit `updatedAt`, which the server assigns.
- Preserve existing IDs when editing. Do not use legacy `pageId` in new output.

## When documenting or changing a format

1. Inspect the relevant source and identify the read/write boundary. Distinguish
   accepted legacy input, normalized state, and newly emitted output.
2. Document field types, required values, defaults, relationships, and information
   lost during conversion. Mark authoring conventions separately from enforced
   constraints. The runtime wins if an older prose reference disagrees with it.
3. Keep examples valid against the real parser. For Markdown, also check link
   resolution and slide parsing; for visual claims, inspect rendered output.
4. If source schemas changed, regenerate the JSON Schemas with
   `node --experimental-strip-types .agents/marmerlade-docs/scripts/export-schemas.mjs`
   from the repository root. Use `--check` to detect drift without writing files.
   Update only affected prose and examples.

## Sources of truth

Resolve these paths from the repository root:

| Concern | Source |
| --- | --- |
| Core entity types | `src/types.ts` |
| Runtime schema and graph integrity | `src/workspaceSchema.ts` |
| Workspace locks, revisions, puts, deletes | `server/workspace.ts` |
| Tool names, parameters, resources | `server/cli.ts` |
| Native rendering and job queue | `server/renderer.ts`, `src/renderContract.ts` |
| Local setup and diagnostics | `server/setup.ts`, `server/environment.ts` |
| Wiki links, normalization, embed scope | `src/pages.ts` |
| Mermaid parsing, output, merge preservation | `src/mermaid/io.ts` |
| Slide parsing, directives, objects, Markdown export | `src/slides.ts` |
| File import/export and localStorage | `src/persist.ts` |
| App appearance and browser settings | `src/appearance.ts`, `src/theme.ts` |

`ONTOLOGY.md` is the product's prose reference and becomes the packaged
`marmerlade://guide` resource. `docs/mcp.md` describes connection setup. Check the
installed server's guide and registered tool schema when working outside this
checkout; installed versions can differ from these references.
