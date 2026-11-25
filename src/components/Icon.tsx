import { activeAppearance, useAppearance } from '../theme';
import { documentIcon } from '../appearance';

// Tiny inline-SVG icon set. Icons inherit `currentColor` and a 1.6 stroke so
// they sit consistently next to text and flip with the theme automatically.

export type IconName =
  | 'cursor'
  | 'text'
  | 'line'
  | 'arrow'
  | 'link'
  | 'lucide-link'
  | 'rect'
  | 'round'
  | 'diamond'
  | 'circle'
  | 'tidy-right'
  | 'sun'
  | 'palette'
  | 'moon'
  | 'code'
  | 'pencil'
  | 'check'
  | 'close'
  | 'plus'
  | 'insert'
  | 'export'
  | 'import'
  | 'film'
  | 'trash'
  | 'copy'
  | 'group'
  | 'more'
  | 'shapes'
  | 'icon-library'
  | 'flowchart'
  | 'sequence'
  | 'product-diagrams'
  | 'product-wiki'
  | 'product-slides'
  | 'pumpkin'
  | 'ghost'
  | 'bat'
  | 'skull'
  | 'book'
  | 'notebook'
  | 'monitor'
  | 'page'
  | 'sidebar'
  | 'folder'
  | 'deck'
  | 'square-p'
  | 'grid'
  | 'expand'
  | 'minimize-2'
  | 'maximize-2'
  | 'play'
  | 'pause'
  | 'stop'
  | 'step-back'
  | 'step-fwd'
  | 'tree'
  | 'image'
  | 'lifeline-start'
  | 'swap'
  | 'wrap-text'
  | 'activate-bar'
  | 'deactivate-bar'
  | 'dot-sender'
  | 'dot-receiver'
  | 'note-left'
  | 'note-over'
  | 'note-right';

const JAR_COLORS = {
  ink: '#3a352e',
  amber: '#f2a23a',
  cream: '#fbf8f1',
  accent: '#d0532f',
};

const PATHS: Record<IconName, React.ReactNode> = {
  'square-p': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 17V7h4a3 3 0 0 1 0 6H9" /></>,
  'lifeline-start': <><path d="M2 8h6" /><path d="m5.5 5 3 3-3 3" /><rect x="9" y="3" width="13" height="7" rx="1.5" /><path d="M15.5 10v11" strokeDasharray="2.5 2.5" /></>,
  swap: <path d="M4 8h15m-3-3 3 3-3 3M20 16H5m3-3-3 3 3 3" />,
  'wrap-text': <path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-5m2-2-2 2 2 2M4 18h4" />,
  'activate-bar': <><path d="M15 3v18" strokeDasharray="2.5 2.5" /><rect x="12.5" y="9" width="5" height="12" rx="1" /><path d="M3 7h6M6 4v6" /></>,
  'deactivate-bar': <><path d="M15 3v18" strokeDasharray="2.5 2.5" /><rect x="12.5" y="3" width="5" height="11" rx="1" /><path d="M3 18h6" /></>,
  'dot-sender': <><path d="M5 3v18" strokeDasharray="2.5 2.5" /><circle cx="5" cy="12" r="2.5" /><path d="M8 12h13m-4-3.5 4 3.5-4 3.5" /></>,
  'dot-receiver': <><path d="M19 3v18" strokeDasharray="2.5 2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M3 12h13m-4-3.5 4 3.5-4 3.5" /></>,
  'note-left': <><path d="M18 3v18" strokeDasharray="2.5 2.5" /><path d="M3 8h9l2 2v6H3Z" /></>,
  'note-over': <><path d="M12 3v18" strokeDasharray="2.5 2.5" /><path d="M4 8h14l2 2v6H4Z" fill="var(--mf-input, transparent)" /></>,
  'note-right': <><path d="M6 3v18" strokeDasharray="2.5 2.5" /><path d="M10 8h9l2 2v6H10Z" /></>,
  pumpkin: <><path d="M12 7C5 2 1 8 3 15c1 5 6 7 9 5 3 2 8 0 9-5 2-7-2-13-9-8ZM12 7c-1-3 0-5 2-5" /><path d="m6 11 3 1-2 2Zm12 0-3 1 2 2Z" fill="currentColor" stroke="none" /><path d="m7 16 2 2 3-1 3 1 2-2" /></>,
  ghost: <><path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-4 2-4-2Z" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /><path d="M10 15h4" /></>,
  bat: <path d="m12 9-2-3-1 4C6 7 3 6 2 5v9c3-1 4 0 5 3 2-1 3 0 5 3 2-3 3-4 5-3 1-3 2-4 5-3V5c-1 1-4 2-7 5l-1-4Z" />,
  skull: <><path d="M8 21v-4a8 8 0 1 1 8 0v4ZM11 18v3M13 18v3" /><circle cx="8.5" cy="10.5" r="1.5" /><circle cx="15.5" cy="10.5" r="1.5" /><path d="m12 13-1 2h2Z" fill="currentColor" stroke="none" /></>,
  book: <><path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1Z" /><path d="M12 5v16" /></>,
  notebook: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M9 3v18M3 7h4M3 12h4M3 17h4M12 8h5M12 12h5" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M8 21h8" /></>,
  sidebar: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>,
  text: <path d="M4 6V4h16v2M12 4v16M8 20h8" />,
  line: <path d="M5 19 19 5" />,
  arrow: <path d="M5 19 19 5M8 5h11v11" />,
  link: <path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 9l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />,
  'lucide-link': (
    <g strokeWidth={2}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </g>
  ),
  page: (
    <>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  deck: (
    <>
      <rect x="6" y="3" width="16" height="14" rx="1.5" />
      <path d="M18 17v4H2V7h4M10 7h8M10 11h5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  'minimize-2': <path d="m14 10 7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" />,
  'maximize-2': <path d="M15 3h6v6m0-6-7 7M3 21l7-7m-1 7H3v-6" />,
  rect: <rect x="3" y="6" width="18" height="12" rx="2" />,
  round: <rect x="3" y="6" width="18" height="12" rx="6" />,
  diamond: <path d="M12 3 21 12 12 21 3 12Z" />,
  circle: <circle cx="12" cy="12" r="8" />,
  'tidy-right': (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3C21 6.7 17 3 12 3Z" />
      <circle cx="7.5" cy="11" r=".7" fill="currentColor" />
      <circle cx="10" cy="7.5" r=".7" fill="currentColor" />
      <circle cx="14" cy="7.5" r=".7" fill="currentColor" />
      <circle cx="17" cy="10.5" r=".7" fill="currentColor" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </>
  ),
  moon: <path d="M20 13A8 8 0 1 1 11 4a6 6 0 0 0 9 9Z" />,
  tree: <path d="M4 5h6M4 12h6M4 19h6M14 5h6M14 12h6M14 19h6M7 5v14" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  pencil: <path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  // Two lifelines with a message between them: adds a sequence element.
  insert: <path d="M5 4v16M19 4v16M5 11h11m-3-3 3 3-3 3" />,
  export: (
    <>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  import: (
    <>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 19h14" />
    </>
  ),
  // a film strip: the frame with sprocket holes down the sides
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16" />
      <path d="M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  // two cards gathered inside a dashed frame
  group: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2.5" />
      <rect x="7" y="7" width="6" height="4" rx="1" />
      <rect x="11" y="13" width="6" height="4" rx="1" />
    </>
  ),
  // arrow pointer
  cursor: (
    <path d="M5 3l14 7.5-6.2 1.7L10 18.5z" />
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  'icon-library': <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="10" r="3" /><path d="M7 18c.5-2.5 2.3-4 5-4s4.5 1.5 5 4" /></>,
  // a square, a circle and a triangle: the shape library
  shapes: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <circle cx="17" cy="7" r="3.5" />
      <path d="M7 13.5l3.8 6.5H3.2z" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="3.5" />
    </>
  ),
  // a start step feeding a decision that branches into two outcomes
  flowchart: (
    <>
      <rect x="8" y="2" width="8" height="5" rx="1.2" />
      <path d="M12 7v2.5M12 9.5l3.5 3.5-3.5 3.5-3.5-3.5Z" />
      <path d="M8.5 13H5v4M15.5 13H19v4" />
      <rect x="2.5" y="17" width="5" height="4.5" rx="1" />
      <rect x="16.5" y="17" width="5" height="4.5" rx="1" />
    </>
  ),
  // two participants over dotted lifelines, a call across and a reply back
  sequence: (
    <>
      <rect x="2.5" y="2.5" width="7" height="4.5" rx="1" />
      <rect x="14.5" y="2.5" width="7" height="4.5" rx="1" />
      <path d="M6 9.5v12M18 9.5v12" strokeDasharray="0 3" />
      <path d="M8 12h8m-2.5-2.5L16 12l-2.5 2.5" />
      <path d="M16 18H8m2.5-2.5L8 18l2.5 2.5" />
    </>
  ),
  'product-diagrams': (
    <>
      <path d="M12 10v3.25M6 16v-2.75h12V16" />
      <g stroke={JAR_COLORS.ink}>
        <path d="m12 3 3.5 3.5-3.5 3.5-3.5-3.5Z" fill={JAR_COLORS.amber} />
        <rect x="3" y="16" width="6" height="5" rx="1.2" fill={JAR_COLORS.cream} />
        <rect x="15" y="16" width="6" height="5" rx="1.2" fill={JAR_COLORS.cream} />
      </g>
    </>
  ),
  'product-wiki': (
    <g stroke={JAR_COLORS.ink}>
      <path d="M12 6C9 4 6 3.5 3 4.5v14c3-.8 6-.3 9 1.5 3-1.8 6-2.3 9-1.5v-14c-3-1-6-.5-9 1.5Z" fill={JAR_COLORS.cream} />
      <path d="M12 6v14M6 9c1.1 0 2.1.2 3 .6M6 13c1.1 0 2.1.2 3 .6M15 13.6c.9-.4 1.9-.6 3-.6" />
      <path d="M15.5 4.5v6l1.5-1 1.5 1V4.1" fill={JAR_COLORS.amber} strokeWidth="1.4" />
    </g>
  ),
  'product-slides': (
    <g stroke={JAR_COLORS.ink}>
      <rect x="3" y="8" width="14.5" height="12" rx="1.5" fill={JAR_COLORS.amber} />
      <rect x="6.5" y="4" width="14.5" height="12" rx="1.5" fill={JAR_COLORS.cream} />
      <path d="M10 8.5h7.5" stroke={JAR_COLORS.accent} />
      <path d="M10 12h4.5" />
    </g>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  pause: <path d="M8 5v14M16 5v14" />,
  'step-back': (
    <>
      <path d="M18 5l-9 7 9 7z" />
      <path d="M5 5v14" />
    </>
  ),
  'step-fwd': (
    <>
      <path d="M6 5l9 7-9 7z" />
      <path d="M19 5v14" />
    </>
  ),
  // vertical three-dot kebab menu
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}) {
  const appearance = activeAppearance(useAppearance());
  const kind = name === 'page' ? 'wiki' : name === 'deck' ? 'slides' : undefined;
  const selected = kind ? documentIcon(appearance, kind) : undefined;
  return (
    <svg
      className="mf-svg"
      data-document-icon={kind}
      data-icon={selected?.symbol ?? name}
      style={kind ? { color: `var(--mf-${kind}-icon)` } : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[selected?.symbol ?? name]}
    </svg>
  );
}
