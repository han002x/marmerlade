// Core data model for marmerlade diagrams.
// A graph is a flat list of nodes + edges. Any node can be a "group" that
// owns children; collapsing a group hides its subtree (drill-down). A group
// has no card of its own until it is folded: unfolded, it is a titled sheet.

/**
 * Node outlines. Every shape has a classic Mermaid bracket form (see
 * src/mermaid/io.ts), so all of them render in any Mermaid version.
 */
export type NodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'dbl-circle'
  | 'diamond'
  | 'hexagon'
  | 'lean-r'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t'
  | 'flag';

/** Stroke dash pattern for a node border or an edge line. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Hand-drawn ink level. 0 = ink (clean), 1 = sketch, 2 = scribble. */
export type Sloppiness = 0 | 1 | 2;

/** Corner treatment for node outlines. */
export type EdgeStyle = 'sharp' | 'round';

export type Arrowheads = 'none' | 'start' | 'end' | 'both';

export type FontFamily = 'sans' | 'serif' | 'mono' | 'hand';

/**
 * Motion presets. `none` is the static default. `pulse`, `fade` and `draw`
 * read best on node bodies; `flow` animates an edge's dashes travelling along
 * the line. The panel shows whichever subset fits the current selection.
 */
export type AnimationKind = 'none' | 'pulse' | 'fade' | 'draw' | 'flow';

/**
 * Visual overrides shared by nodes and edges. Every field is optional; a
 * missing field means "fall back to the theme default". This keeps older saved
 * diagrams (and mermaid imports) valid without a migration.
 */
export interface ElementStyle {
  /** border (node) / line (edge) color; any CSS color */
  stroke?: string;
  /** fill color for node bodies; 'transparent' is allowed */
  background?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  /** Arrowhead positions on an edge. */
  arrowheads?: Arrowheads;
  sloppiness?: Sloppiness;
  /** corner treatment for node outlines */
  edges?: EdgeStyle;
  fontFamily?: FontFamily;
  fontSize?: number;
  fontColor?: string;
  /** 0..1 */
  opacity?: number;
  /** motion preset applied to the element (missing => 'none') */
  animation?: AnimationKind;
  /** seconds for one animation cycle (missing => default) */
  animationSpeed?: number;
}

/** An image node's picture: a remote http(s) URL or an embedded data: URI. */
export interface NodeImage {
  src: string;
  /** label position: 't' above the image, 'b' (default) below */
  pos?: 't' | 'b';
  /** image width / height in px (missing => DEFAULT_IMAGE_SIZE) */
  w?: number;
  h?: number;
  /** keep the image's aspect ratio inside w x h (Mermaid `constraint: "on"`) */
  constraint?: boolean;
}

export const DEFAULT_IMAGE_SIZE = 80;

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** id of the parent group node, or null for a top-level node */
  parentId: string | null;
  /** collapsed groups hide their descendants */
  collapsed: boolean;
  /**
   * persisted canvas position. Ignored for groups: an unfolded group is only a
   * sheet titled with its `label`, and a folded one shows its card at the
   * top-left of its contents
   */
  position: { x: number; y: number };
  /** Canvas dimensions after a manual resize. Omitted for auto-sized nodes. */
  size?: { width: number; height: number };
  /**
   * full Iconify name (`lucide:database`, `simple-icons:github`). Set, the node
   * shows an icon in the node and exports as Mermaid's `@{ icon: ... }` form.
   * Shapes beyond Mermaid's icon forms are preserved in a marmerlade comment.
   */
  icon?: string;
  /** linked wiki pages in order; the first is the default */
  pageIds?: string[];
  /** linked slide decks in order; the first is the default */
  deckIds?: string[];
  /**
   * Mermaid's `@{ img: ... }` image node. Set, the node shows the picture with
   * its label above (`pos: 't'`) or below (default) it; wins over `icon`
   */
  image?: NodeImage;
  /** optional per-node visual overrides */
  style?: ElementStyle;
}

/** Pages and decks linked to a sequence participant, like a node's `pageIds` / `deckIds`. */
export interface DocumentLinks {
  /** linked wiki pages in order; the first is the default */
  pageIds?: string[];
  /** linked slide decks in order; the first is the default */
  deckIds?: string[];
}

/** A Markdown wiki page. Nodes point at pages; pages outlive their nodes. */
export interface Page {
  id: string;
  title: string;
  /** Markdown source */
  body: string;
  /** epoch ms of the last edit; the newer copy wins when windows sync */
  updatedAt: number;
}

/** A slide deck: Markdown with `---` between slides. Linked to nodes like a page. */
export type Deck = Page;

export interface WikiFolder {
  id: string;
  name: string;
  parentId: string | null;
  pageIds: string[];
}

/** A side of a node where an edge attaches. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * An edge path from the last Tidy: the sides it leaves and enters by and the
 * bends in between, in canvas coordinates. `from` and `to` are the source and
 * target positions it was laid out for; once either end moves, the route no
 * longer fits and the edge is drawn as a plain curve.
 */
export interface EdgeRoute {
  sourceSide: Side;
  targetSide: Side;
  points: { x: number; y: number }[];
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** centre of the room Tidy left for the edge's label */
  label?: { x: number; y: number };
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** side the edge leaves from / arrives at; missing => the side facing the other end */
  sourceSide?: Side;
  targetSide?: Side;
  /** 1-based step in the flow sequence; missing => follows the graph */
  order?: number;
  /** the path Tidy found for this edge; drawn while both ends stay put */
  route?: EdgeRoute;
  /** optional per-edge visual overrides */
  style?: ElementStyle;
}

/** Which way a flowchart's ranks run: down (`flowchart TD`) or across (`flowchart LR`). */
export type FlowDirection = 'TB' | 'LR';

export interface Diagram {
  /** flowchart direction; missing => TB */
  direction?: FlowDirection;
  diagrams?: DiagramEntity[];
  /** Mermaid sequence source, independent of the flowchart. */
  sequence?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** wiki pages; absent in diagrams saved before the wiki existed */
  pages?: Page[];
  /** slide decks; absent in diagrams saved before slides existed */
  decks?: Deck[];
  wikiFolders?: WikiFolder[];
}

/** A diagram placed on the shared workspace canvas. */
export type DiagramEntity = {
  id: string;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
} & (
  | { kind: 'flowchart'; nodes: DiagramNode[]; edges: DiagramEdge[]; direction?: FlowDirection }
  | {
      kind: 'sequence';
      source: string;
      /** per-element styles; Mermaid has no sequence style syntax (see sequence/styleMap.ts) */
      styles?: Record<string, ElementStyle>;
      /** pages and decks linked to participants, keyed by participant id */
      links?: Record<string, DocumentLinks>;
    }
);
