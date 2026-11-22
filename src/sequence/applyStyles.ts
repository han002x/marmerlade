import type { ElementStyle } from '../types';
import { dashArray, flowDash, fontFamilyCss, STYLE_DEFAULTS } from '../style';
import { ink, seedOf } from '../rough';
import type { Statement } from './model';
import { actorKey, statementKey, type SequenceStyles } from './styleMap';

const SAVED = 'data-sq-original';
const MARKER = 'data-sq-marker';
const SHAPES = new Set(['rect', 'polygon', 'circle', 'ellipse', 'path', 'line', 'polyline']);
const OWNER = '[data-statement],[data-sequence-actor]';

/** Undo a previous `applySequenceStyles`, so styles can be re-applied to the same drawing. */
function reset(svg: SVGSVGElement) {
  for (const added of svg.querySelectorAll(`[${MARKER}],[${INK}]`)) added.remove();
  for (const el of svg.querySelectorAll(`[${SAVED}]`)) {
    const saved = JSON.parse(el.getAttribute(SAVED)!) as Record<string, string | null>;
    for (const [name, value] of Object.entries(saved)) {
      if (value === null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
    el.removeAttribute(SAVED);
  }
}

function save(el: Element, ...names: string[]) {
  const saved = el.hasAttribute(SAVED) ? (JSON.parse(el.getAttribute(SAVED)!) as Record<string, string | null>) : {};
  for (const name of names) if (!(name in saved)) saved[name] = el.getAttribute(name);
  el.setAttribute(SAVED, JSON.stringify(saved));
}

/** Arrowhead markers are shared, so a recolored line gets its own copy. */
function recolorMarkers(svg: SVGSVGElement, line: SVGElement, color: string) {
  for (const name of ['marker-start', 'marker-end']) {
    const id = /url\(#(.+)\)/.exec(line.getAttribute(name) ?? '')?.[1];
    const marker = id && svg.getElementById(id);
    if (!marker) continue;
    const copy = marker.cloneNode(true) as SVGElement;
    copy.id = `${id}-sq-${svg.querySelectorAll(`[${MARKER}]`).length}`;
    copy.setAttribute(MARKER, '');
    for (const part of copy.querySelectorAll<SVGElement>('*')) {
      if (!SHAPES.has(part.tagName.toLowerCase())) continue;
      part.style.stroke = color;
      if (part.getAttribute('fill') !== 'none' && part.style.fill !== 'none') part.style.fill = color;
    }
    marker.parentNode!.appendChild(copy);
    save(line, name);
    line.setAttribute(name, `url(#${copy.id})`);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = 'data-sq-ink';
const n = (el: Element, name: string) => Number(el.getAttribute(name) ?? 0);

/** The clean outline of a Mermaid shape, for roughjs to re-draw; undefined when it cannot be traced. */
function outlineOf(part: SVGElement): string | undefined {
  switch (part.tagName.toLowerCase()) {
    case 'line':
      return `M${n(part, 'x1')} ${n(part, 'y1')}L${n(part, 'x2')} ${n(part, 'y2')}`;
    case 'rect': {
      const [x, y, w, h] = [n(part, 'x'), n(part, 'y'), n(part, 'width'), n(part, 'height')];
      const r = Math.max(0, Math.min(n(part, 'rx'), w / 2, h / 2));
      if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return (
        `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
        `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
        `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
      );
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n(part, 'cx'), n(part, 'cy')];
      const rx = n(part, part.hasAttribute('rx') ? 'rx' : 'r');
      const ry = n(part, part.hasAttribute('ry') ? 'ry' : 'r');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const points = (part.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (points.length < 4 || points.some(Number.isNaN)) return undefined;
      const pairs = [];
      for (let i = 0; i + 1 < points.length; i += 2) pairs.push(points[i] + ' ' + points[i + 1]);
      return 'M' + pairs.join('L') + (part.tagName.toLowerCase() === 'polygon' ? 'Z' : '');
    }
    case 'path':
      return part.getAttribute('d') ?? undefined;
  }
  return undefined;
}

/**
 * Re-draw a shape's stroke as hand-drawn ink, as flowchart outlines are: the original keeps
 * its clean fill, and the inked path on top carries the stroke and any arrowheads.
 */
function inkOver(part: SVGElement, sloppiness: 1 | 2, seed: number, continuous: boolean): SVGElement | undefined {
  const outline = outlineOf(part);
  if (!outline) return undefined;
  const line = part.tagName.toLowerCase() === 'line' || part.matches('.messageLine0,.messageLine1');
  const computed = getComputedStyle(part);
  if (computed.stroke === 'none' || computed.stroke === 'transparent') return undefined;
  const inked = document.createElementNS(SVG_NS, 'path') as SVGElement;
  inked.setAttribute('d', ink(outline, { sloppiness, seed, continuous, pinEnds: line }));
  inked.setAttribute(INK, '');
  for (const name of ['transform', 'data-statement']) {
    const value = part.getAttribute(name);
    if (value !== null) inked.setAttribute(name, value);
  }
  Object.assign(inked.style, {
    fill: 'none',
    stroke: computed.stroke,
    strokeWidth: computed.strokeWidth,
    strokeDasharray: computed.strokeDasharray,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    pointerEvents: 'none',
  });
  for (const name of ['marker-start', 'marker-end']) {
    const marker = part.getAttribute(name);
    if (!marker) continue;
    save(part, name);
    part.removeAttribute(name);
    inked.setAttribute(name, marker);
  }
  part.style.stroke = 'transparent';
  part.after(inked);
  return inked;
}

function paint(svg: SVGSVGElement, owner: SVGElement, style: ElementStyle, kind: string, seed: string) {
  // Nested elements tagged with another statement (such as `else` titles) are painted by their own owner.
  const parts = [owner, ...owner.querySelectorAll<SVGElement>('*')].filter(
    (part) => part === owner || part.closest(OWNER) === owner,
  );
  save(owner, 'style', 'data-sq-anim');
  if (style.opacity != null) owner.style.opacity = String(style.opacity);
  const animation = style.animation && style.animation !== 'none' ? style.animation : undefined;
  const duration = `${style.animationSpeed ?? STYLE_DEFAULTS.animationSpeed}s`;
  // Pulse and fade move the whole element; draw and flow run along each stroked shape.
  const whole = animation === 'pulse' || animation === 'fade' ? animation : undefined;
  if (whole) {
    owner.setAttribute('data-sq-anim', whole);
    owner.style.setProperty('--mf-anim-dur', duration);
  }
  // Mermaid draws sequences with clean lines, so only a chosen sloppiness re-inks them.
  const sloppiness = style.sloppiness;
  parts.forEach((part, index) => {
    const tag = part.tagName.toLowerCase();
    if (tag === 'text' || tag === 'tspan') {
      save(part, 'style');
      if (style.fontColor) part.style.fill = style.fontColor;
      if (style.fontFamily) part.style.fontFamily = fontFamilyCss(style.fontFamily);
      if (style.fontSize != null) part.style.fontSize = style.fontSize + 'px';
      return;
    }
    if (!SHAPES.has(tag)) return;
    // A message's activation bar belongs to the participant, not the message.
    if (kind === 'message' && part.matches('.activation0,.activation1,.activation2')) return;
    const lifeline = part.matches('[data-et="life-line"]');
    const line = tag === 'line' || part.matches('.messageLine0,.messageLine1');
    save(part, 'style', 'rx', 'ry', 'pathLength', 'data-sq-shape');
    if (style.stroke) part.style.stroke = style.stroke;
    const width = style.strokeWidth ?? (parseFloat(getComputedStyle(part).strokeWidth) || 1);
    if (!lifeline && style.strokeWidth != null) part.style.strokeWidth = String(width);
    if (!lifeline && style.strokeStyle) part.style.strokeDasharray = dashArray(style.strokeStyle, width) ?? 'none';
    if (style.background && !line) part.style.fill = style.background;
    if (style.edges && tag === 'rect') {
      const radius = style.edges === 'round' ? '8' : '0';
      part.setAttribute('rx', radius);
      part.setAttribute('ry', radius);
    }
    if (style.stroke && (part.hasAttribute('marker-end') || part.hasAttribute('marker-start')))
      recolorMarkers(svg, part, style.stroke);
    // Dashes and the moving presets need one continuous pen line to run along.
    const dashed = (part.style.strokeDasharray || getComputedStyle(part).strokeDasharray || 'none') !== 'none';
    const continuous = dashed || animation === 'flow' || animation === 'draw';
    const shape = (sloppiness && inkOver(part, sloppiness, seedOf(seed + ':' + index), continuous)) || part;
    if (shape !== part && part === owner) {
      // Ink beside a top-level shape is outside it, so it takes the element-wide opacity and motion itself.
      if (style.opacity != null) shape.style.opacity = String(style.opacity);
      if (whole) {
        shape.setAttribute('data-sq-anim', whole);
        shape.style.setProperty('--mf-anim-dur', duration);
      }
    }
    if (lifeline || (animation !== 'draw' && animation !== 'flow')) return;
    shape.setAttribute('data-sq-shape', animation);
    shape.style.setProperty('--mf-anim-dur', duration);
    if (animation === 'draw') shape.setAttribute('pathLength', '100');
    if (animation === 'flow') {
      // Flow follows the element's own stroke style, like flowchart edges.
      const dash = flowDash(style.strokeStyle ?? (line && part.style.strokeDasharray ? 'dashed' : 'solid'), width);
      shape.style.strokeDasharray = dash.array;
      shape.style.setProperty('--mf-flow-period', `${dash.period}px`);
    }
  });
}

/**
 * Paint per-element styles onto a sequence drawing already tagged by `bindSelection`.
 * Calling it again first restores the drawing, so it is safe to re-run on every change.
 */
export function applySequenceStyles(svg: SVGSVGElement, rows: Statement[], styles: SequenceStyles | undefined) {
  reset(svg);
  if (!styles || !Object.keys(styles).length) return;
  // Each participant has several drawn parts (header, lifeline, footer); seed each one apart.
  const drawn = new Map<string, number>();
  for (const owner of svg.querySelectorAll<SVGElement>('[data-sequence-actor]')) {
    if (owner.parentElement?.closest('[data-sequence-actor]')) continue;
    const key = actorKey(owner.getAttribute('data-sequence-actor')!);
    const style = styles[key];
    const count = drawn.get(key) ?? 0;
    drawn.set(key, count + 1);
    if (style) paint(svg, owner, style, 'participant', key + '#' + count);
  }
  const byStart = new Map(rows.map((row) => [row.start, row]));
  for (const owner of svg.querySelectorAll<SVGElement>('[data-statement]:not([data-sequence-actor])')) {
    const row = byStart.get(Number(owner.getAttribute('data-statement')));
    if (!row || row.kind === 'participant') continue;
    const key = statementKey(rows, row);
    const style = key && styles[key];
    if (style) paint(svg, owner, style, row.kind, key);
  }
}
