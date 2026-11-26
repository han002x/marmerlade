import { useRef } from 'react';
import { COLORS, DOCUMENT_SYMBOLS, FONTS, PRESETS, documentIcon, type Appearance } from '../appearance';
import { activeAppearance, saveAppearance, useAppearance } from '../theme';
import { useDiagram } from '../store';
import type { Diagram } from '../types';
import { saveForNavigation } from '../persist';
import { Icon } from './Icon';
import './appearance.css';

export function AppearanceSettings() {
  const settings = useAppearance();
  const style = activeAppearance(settings);
  const lastRestyled = useRef<Pick<Diagram, 'nodes' | 'edges' | 'decks'> | null>(null);
  const choose = (selected: string, custom = settings.custom) => {
    useDiagram.getState().restyleAppearance();
    const { nodes, edges, decks } = useDiagram.getState();
    saveForNavigation();
    lastRestyled.current = { nodes, edges, decks };
    saveAppearance(selected, custom);
  };
  const patch = (change: Partial<Appearance>) => {
    const custom = { ...style, ...change };
    const state = useDiagram.getState();
    const previous = lastRestyled.current;
    if (previous?.nodes === state.nodes && previous.edges === state.edges && previous.decks === state.decks) {
      saveAppearance('custom', custom);
    } else {
      choose('custom', custom);
    }
  };
  return <>
    <div className="mf-appearance-presets" role="group" aria-label="App styles">
      {[...PRESETS, { id: 'custom', name: 'Custom', style: settings.custom ?? style }].map((preset) => <button
        type="button" key={preset.id} aria-pressed={settings.selected === preset.id}
        onClick={() => choose(preset.id, preset.id === 'custom' ? settings.custom ?? style : settings.custom)}>
        <span>{preset.name}</span>
        <span className="mf-appearance-preview" aria-hidden="true">
          {COLORS.map((color) => <span key={color} style={{ background: preset.style.colors[color] }} />)}
        </span>
      </button>)}
    </div>
    {settings.selected === 'custom' && <div className="mf-custom-controls">
      <label className="mf-appearance-field">Reset from preset<select aria-label="Reset custom from preset" value="" onChange={(e) => {
        const preset = PRESETS.find((p) => p.id === e.target.value);
        if (preset) choose('custom', preset.style);
      }}><option value="" disabled>Choose preset</option>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <fieldset><legend>Colors</legend><div className="mf-appearance-colors">
        {COLORS.map((key) => <label key={key}>{({ bg: 'Canvas', diagram: 'Diagram canvas', panel: 'Panels', border: 'Borders', text: 'Text', muted: 'Muted text', ink: 'Ink', pencil: 'Grid', accent: 'Accent', seal: 'Brand', node: 'Nodes', group: 'Groups', input: 'Inputs' })[key]}
          <input type="color" value={style.colors[key]} onInput={(e) => patch({ colors: { ...style.colors, [key]: e.currentTarget.value } })} />
        </label>)}
      </div></fieldset>
      <fieldset><legend>Icons</legend>
        {(['wiki', 'slides'] as const).map((kind) => {
          const value = documentIcon(style, kind);
          const name = kind === 'wiki' ? 'Wiki' : 'Slides';
          const update = (change: Partial<typeof value>) => saveAppearance('custom', { ...style, [kind === 'wiki' ? 'wikiIcon' : 'slidesIcon']: { ...value, ...change } });
          return <div className="mf-appearance-field" key={kind}>
            <label htmlFor={`appearance-${kind}-symbol`}>{name}</label>
            <span className="mf-appearance-icon-controls"><Icon name={kind === 'wiki' ? 'page' : 'deck'} size={20} />
              <select id={`appearance-${kind}-symbol`} aria-label={`${name} icon symbol`} value={value.symbol} onChange={(e) => {
                const symbol = DOCUMENT_SYMBOLS.find((option) => option.id === e.target.value);
                if (symbol) update({ symbol: symbol.id });
              }}>{DOCUMENT_SYMBOLS.map((symbol) => <option key={symbol.id} value={symbol.id}>{symbol.label}</option>)}</select>
              <input type="color" aria-label={`${name} icon color`} value={value.color} onInput={(e) => update({ color: e.currentTarget.value })} />
            </span>
          </div>;
        })}
      </fieldset>
      <fieldset><legend>Typography</legend>{(['uiFont','contentFont','headingFont'] as const).map((key) => <label className="mf-appearance-field" key={key}>
        {{uiFont:'UI font',contentFont:'Content font',headingFont:'Heading font'}[key]}<select aria-label={{uiFont:"UI font",contentFont:"Content font",headingFont:"Heading font"}[key]} value={style[key]} onChange={(e) => {
          const font = (['sans','serif','mono','hand'] as const).find((f) => f === e.target.value);
          if (font) patch({ [key]: font });
        }}>{Object.entries(FONTS).map(([font, css]) => <option key={font} value={font} style={{ fontFamily: css }}>{font}</option>)}</select>
      </label>)}</fieldset>
      <fieldset><legend>Drawing</legend>
        <label className="mf-appearance-field">Sketchiness<select aria-label="Sketchiness" value={style.sloppiness} onChange={(e) => {
          const sloppiness = ([0,1,2] as const).find((n) => n === Number(e.target.value));
          if (sloppiness !== undefined) patch({ sloppiness });
        }}><option value={0}>Ink</option><option value={1}>Sketch</option><option value={2}>Scribble</option></select></label>
        <label className="mf-appearance-field">Corners<select aria-label="Corners" value={style.corners} onChange={(e) => patch({ corners: e.target.value === 'sharp' ? 'sharp' : 'round' })}><option value="sharp">Sharp</option><option value="round">Round</option></select></label>
        <label className="mf-appearance-field">Texture<select aria-label="Texture" value={style.texture} onChange={(e) => {
          const texture = (['plain','paper','grid'] as const).find((t) => t === e.target.value);
          if (texture) patch({ texture });
        }}><option value="plain">Plain</option><option value="paper">Paper</option><option value="grid">Grid</option></select></label>
        <label className="mf-appearance-field">Shadows<input type="checkbox" checked={style.shadows} onChange={(e) => patch({ shadows: e.target.checked })} /></label>
      </fieldset>
    </div>}
  </>;
}
