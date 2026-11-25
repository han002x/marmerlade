import { isSequence } from '../sequence/model';
import { drawWithLinkLegend } from '../sequence/popupFallback';
import { colorMode, FONTS, type Appearance } from '../appearance';
import { ICONS } from '../icons/catalog';

const svgCache = new Map<string, string>();
let seq = 0;

async function renderDiagramSvg(source: string, appearance: Appearance) {
  const key = `${JSON.stringify(appearance)}\u0000${source}`;
  let svg = svgCache.get(key);
  if (!svg) {
    const { default: mermaid } = await import('mermaid');
    for (const prefix of ['lucide', 'simple-icons']) {
      const icons = Object.fromEntries(
        ICONS.filter((icon) => icon.id.startsWith(`${prefix}:`)).map((icon) => [
          icon.id.slice(prefix.length + 1),
          { body: icon.body },
        ]),
      );
      mermaid.registerIconPacks([{ name: prefix, icons: { prefix, width: 24, height: 24, icons } }]);
    }
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      look: appearance.sloppiness ? 'handDrawn' : 'classic',
      themeVariables: {
        darkMode: colorMode(appearance) === 'dark',
        background: appearance.colors.bg,
        actorBkg: appearance.colors.node,
        actorBorder: appearance.colors.ink,
        actorTextColor: appearance.colors.text,
        signalColor: appearance.colors.ink,
        signalTextColor: appearance.colors.text,
        noteBkgColor: appearance.colors.group,
        noteTextColor: appearance.colors.text,
        labelTextColor: appearance.colors.text,
        loopTextColor: appearance.colors.text,
        primaryColor: appearance.colors.node,
        primaryTextColor: appearance.colors.text,
        primaryBorderColor: appearance.colors.ink,
        lineColor: appearance.colors.ink,
        secondaryColor: appearance.colors.group,
        tertiaryColor: appearance.colors.panel,
        clusterBkg: appearance.colors.group,
        clusterBorder: appearance.colors.border,
        edgeLabelBackground: appearance.colors.panel,
        fontFamily: FONTS[appearance.contentFont],
      },
    });
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;top:0;left:-100000px;visibility:hidden';
    document.body.appendChild(host);
    try {
      await mermaid.parse(source);
      try {
        svg = (await mermaid.render(`wk-embed-${seq++}`, source, host)).svg;
      } catch (error) {
        if (!isSequence(source) || !(error instanceof TypeError && error.message.includes("reading 'class'")))
          throw error;
        svg = await drawWithLinkLegend(mermaid, source, `wk-embed-${seq++}`, host);
      }
    } finally {
      host.remove();
    }
    if (svgCache.size >= 100) svgCache.delete(svgCache.keys().next().value ?? '');
    svgCache.set(key, svg);
  }
  return svg;
}

let renderQueue: Promise<unknown> = Promise.resolve();
export function diagramSvg(source: string, appearance: Appearance) {
  const result = renderQueue.then(() => renderDiagramSvg(source, appearance));
  renderQueue = result.catch(() => undefined);
  return result;
}
