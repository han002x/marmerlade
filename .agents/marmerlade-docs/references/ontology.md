# Ontology and workspace JSON

## Document envelope

New saves use `.marmerlade.json` and the following version-3 envelope:

```json
{
  "version": 3,
  "diagram": { "nodes": [], "edges": [], "pages": [], "decks": [] }
}
```

`nodes` and `edges` are required arrays. `pages` and `decks` default to empty
arrays at the runtime schema boundary. The file contains a flat collection;
nesting is expressed with IDs, not nested JSON objects. See
[example.marmerlade.json](example.marmerlade.json) for a linked workspace.

The server also accepts version 1-3 envelopes and bare diagram objects. The
browser file importer accepts an envelope or bare diagram. Author new files as
version 3. Old `.merfolk.json` examples use the same workspace import format.
Normalization migrates a legacy node `pageId` to `pageIds` when no `pageIds`
exists. New output uses `pageIds` only.

## Entities and relationships

| Entity | Collection | Purpose |
| --- | --- | --- |
| DiagramNode | `diagram.nodes` | Shape, icon, image, or containing group |
| DiagramEdge | `diagram.edges` | Directed relationship between node IDs |
| Page | `diagram.pages` | Markdown wiki content |
| Deck | `diagram.decks` | Markdown presentation, with the same fields as Page |

| Relationship | Stored fields | Semantics |
| --- | --- | --- |
| Node to parent | `parentId` | Zero or one parent; `null` means top level |
| Edge to endpoints | `source`, `target` | Two existing node IDs; groups are valid endpoints |
| Node to pages | `pageIds` | Ordered, many-to-many; first page is default |
| Node to decks | `deckIds` | Ordered, many-to-many; first deck is default |
| Document to nodes | Derived | Scan node link lists; no reverse field is stored |
| Wiki links and backlinks | Derived from `body` | Resolve wiki syntax at read time |
| Document to diagram | Embed in `body` | Resolve the current node or explicit target at render time |

An entity ID is unique within its collection. Page and deck IDs use separate
namespaces and may match each other. A page or deck can exist with no linked
node. Unlinking a document or deleting a node does not delete the document.

## DiagramNode

| Field | Required | Type and constraints |
| --- | --- | --- |
| `id` | Yes | String matching `^[A-Za-z0-9_]+$` at the live schema boundary |
| `label` | Yes | String; empty is allowed |
| `shape` | Yes | One of the shapes below; supply it for groups and icon/image nodes too |
| `parentId` | Yes | Existing node ID or `null`; no parent cycles |
| `collapsed` | Yes | Boolean; folding matters only when children exist |
| `position` | Yes | Object with numeric `x` and `y` in canvas coordinates |
| `icon` | No | Iconify ID from the installed catalog for a recognized glyph |
| `image` | No | NodeImage object; takes precedence over `icon` |
| `pageIds` | No | Array of existing page IDs; ordered and normalized to unique IDs |
| `deckIds` | No | Array of existing deck IDs; ordered and normalized to unique IDs |
| `style` | No | ElementStyle object |

Shapes: `rect`, `round`, `stadium`, `subroutine`, `cylinder`, `circle`,
`dbl-circle`, `diamond`, `hexagon`, `lean-r`, `lean-l`, `trap-b`, `trap-t`, `flag`.

A group is a node referenced by at least one child's `parentId`. It has no
separate type field. Its displayed origin is derived from its contents, so
moving only a group's stored `position` does not position the rendered group.
Its expanded representation is a titled sheet; its folded representation is a
card. Leaves have no children regardless of their `collapsed` value.

Folding hides descendants and redirects their external edges to visible
ancestors. Connections between the same visible pair may merge into a crease
with a count. Internal hidden edges disappear from view. No entities are deleted.

Icon nodes use `shape` for their tile: `circle` is circular, `round` is rounded,
and other shapes use a square tile. The installed catalog includes `lucide:*`,
`simple-icons:*`, and selected additional IDs such as `logos:kiro`. Check
`src/icons/catalog.ts`; an arbitrary Iconify ID can be retained without having a
renderable glyph. Unknown IDs show a placeholder.

NodeImage fields:

| Field | Type and meaning |
| --- | --- |
| `src` | Required string; use an HTTP(S) URL or embedded image data URI |
| `pos` | Optional `t` or `b`; label above or below, default below |
| `w`, `h` | Optional positive numbers; image dimensions, default 80 each |
| `constraint` | Optional boolean; preserve aspect ratio inside the dimensions |

The schema requires a string for `src`; it does not establish that a remote URL
loads or permits export. Verify actual image loading when images are part of a
deliverable. Embedded data travels with JSON; a remote URL depends on its host.

## DiagramEdge

| Field | Required | Type and meaning |
| --- | --- | --- |
| `id` | Yes | Nonempty string, unique among edges |
| `source`, `target` | Yes | Existing node IDs |
| `label` | No | String describing the relationship |
| `order` | No | Positive integer, a one-based flow step |
| `style` | No | ElementStyle object |

Edges are directed. Parallel edges are allowed. A diagram can have cycles;
the no-cycle constraint applies to containment. Playback follows the graph and
can animate branches together; explicit `order` overrides the derived step.
Playback explains connections and does not evaluate business conditions.

## Page and Deck

Both have these fields:

| Field | Type and constraints |
| --- | --- |
| `id` | Required string matching `^[A-Za-z0-9_-]+$` at the live schema boundary |
| `title` | Required string; an empty title is accepted |
| `body` | Required string containing Markdown |
| `updatedAt` | Required nonnegative number, epoch milliseconds |

Use a fresh `updatedAt` when editing documents offline. MCP document puts omit
it; the server assigns it. Browser-local document merging uses timestamps;
live-workspace writes use revision checks. These are different mechanisms.

Opening an unlinked node's wiki or slide view can lazily create a document
titled from the node label. Later label changes do not retitle existing
documents. Prefer deliberate titles for discoverable reference material.

## ElementStyle

Every field is optional. Missing values inherit the app's current defaults.

| Field | Type or allowed values |
| --- | --- |
| `stroke`, `background` | String; intended as CSS colors, including `transparent` for fill |
| `strokeWidth` | Nonnegative number |
| `strokeStyle` | `solid`, `dashed`, `dotted` |
| `sloppiness` | `0`, `1`, `2` for clean ink, sketch, scribble |
| `edges` | `sharp`, `round` |
| `fontFamily` | `sans`, `serif`, `mono`, `hand` |
| `fontSize` | Positive number |
| `opacity` | Number from 0 through 1 |
| `animation` | `none`, `pulse`, `fade`, `draw`, `flow` |
| `animationSpeed` | Positive number of seconds per cycle |

Presets can be stored on nodes and edges; `flow` is the traveling dash preset.
Respect reduced-motion behavior when inspecting animations.

App appearance is separate from Diagram. Browser settings such as the selected
Halloween or Blueprint preset live under `marmerlade.appearance`. They are not
included in workspace JSON. Element overrides are included. Changing the app
appearance resets existing diagram and slide styling, so select appearance
before final overrides when reproducing a visual result.

## Validation and persistence boundaries

The generated [workspace schema](workspace.schema.json) describes current input
field shapes. `parseDiagram` in `src/workspaceSchema.ts` additionally normalizes
links, enforces per-collection ID uniqueness, rejects missing parents and parent
cycles, and checks endpoint and document references. Normalization deduplicates
link arrays while preserving their order. Author duplicate-free arrays.

Use this from the repository root to validate a saved file with the actual
runtime parser. Replace the example path when validating another workspace:

```bash
node --experimental-strip-types --input-type=module - .agents/marmerlade-docs/references/example.marmerlade.json <<'JS'
import { readFile } from 'node:fs/promises';
import { parseDiagram } from './src/workspaceSchema.ts';
const saved = JSON.parse(await readFile(process.argv[2], 'utf8'));
const diagram = parseDiagram(saved.diagram ?? saved);
console.log(`Valid: ${diagram.nodes.length} nodes, ${diagram.edges.length} edges`);
JS
```

This validates the contained diagram, not envelope-version compatibility or
rendered content. Current authoring uses version 3; the server rejects explicitly
unsupported file versions. Browser file import performs fewer checks, so a file
opening in the browser is not proof that it meets the live schema.

The regular app saves its envelope in `localStorage["marmerlade.diagram"]`.
The MCP server saves an atomic version-3 JSON file and owns a per-file lock.
Never edit that file externally while the server owns it. Revisions and access
tokens are connection state, not fields in the saved workspace.
