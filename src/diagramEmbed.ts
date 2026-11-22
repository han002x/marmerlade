/** `{{sequence}}` or `{{sequence:Name}}` on a line of its own. */
export const SEQUENCE_LINE = /^\{\{sequence(?::([^}\n]+))?\}\}(?:\{width=\d{1,3}%\})?[ \t]*$/gm;
export const DIAGRAM_LINE = /^\{\{diagram(?::([^}\n]+))?\}\}(?:\{width=(\d{1,3})%\})?[ \t]*$/gm;

export function readDiagramEmbed(source: string) {
  const sequence = /^\{\{sequence(?::([^}\n]+))?\}\}(?:\{width=(\d{1,3})%\})?[ \t]*(?:\n|$)/.exec(source);
  if (sequence) return { raw: sequence[0], sequence: true, target: (sequence[1] ?? '').trim(), width: sequence[2] ? diagramWidth(Number(sequence[2])) : null };
  const match = /^\{\{diagram(?::([^}\n]+))?\}\}(?:\{width=(\d{1,3})%\})?[ \t]*(?:\n|$)/.exec(source);
  if (!match) return;
  return { raw: match[0], sequence: false, target: (match[1] ?? '').trim(), width: match[2] ? diagramWidth(Number(match[2])) : null };
}

export function diagramWidth(width: number): number {
  return Math.round(Math.max(10, Math.min(100, width)));
}

export function diagramMarkdown(target = '', width: number | null = null, sequence = false): string {
  if (sequence) return `{{sequence${target ? ':' + target : ''}}}` + (width === null ? '' : `{width=${diagramWidth(width)}%}`);
  return `{{diagram${target ? ':' + target : ''}}}${width === null ? '' : `{width=${diagramWidth(width)}%}`}`;
}

export function decodeDiagramTarget(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
