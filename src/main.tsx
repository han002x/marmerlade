import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// self-hosted fonts (bundled woff2, no network dependency)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/kalam/400.css'
import '@fontsource/kalam/700.css'
import './index.css'
import Root from './Root.tsx'
import { initializeWorkspace, isLiveWorkspace } from './liveWorkspace.ts'
import { readSaved, startAutosave, startSync } from './persist.ts'
import { parseRoute } from './route.ts'
import { useDiagram } from './store.ts'
import { SAMPLE } from './sample.ts'
import { isFirstRun } from './components/Welcome.tsx'
import { useDock } from './dock.ts'

async function start() {
  await initializeWorkspace();
  let showWelcome = false;
  if (!window.__marmerladeRender && !isLiveWorkspace()) {
    const saved = readSaved();
    if (saved) useDiagram.getState().load(saved);
    startAutosave();
    startSync();
    const { kind } = parseRoute(window.location.hash);
    if (!saved && (kind === 'canvas' || kind === 'node')) {
      useDiagram.getState().load(SAMPLE);
      showWelcome = isFirstRun();
      if (showWelcome) useDock.getState().setOpen(false);
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root showWelcome={showWelcome} />
    </StrictMode>,
  );
}
void start().catch(error => {
  const root = document.getElementById('root');
  if (root) root.textContent = `Unable to open workspace: ${error instanceof Error ? error.message : String(error)}. Reload to retry.`;
});
