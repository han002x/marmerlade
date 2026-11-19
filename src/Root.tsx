import { lazy, Profiler, Suspense } from 'react'
import App from './App.tsx'
import WorkspaceStatus from './components/WorkspaceStatus.tsx'
import AppearanceDialog from './components/AppearanceDialog'

import { parseRoute, useHash } from './route.ts'

// the wiki and the slides are their own windows; keep them out of the canvas bundle
const WikiApp = lazy(() => import('./wiki/WikiApp.tsx'))
const SlidesApp = lazy(() => import('./slides/SlidesApp.tsx'))
const DocsApp = lazy(() => import('./docs/DocsApp.tsx'))

function Route() {
  const route = parseRoute(useHash())
  if (route.kind === 'docs')
    return (
      <Suspense fallback={null}>
        <DocsApp />
      </Suspense>
    )
  if (route.kind === 'wiki')
    return (
      <Suspense fallback={null}>
        <WikiApp pageId={route.id} nodeId={route.nodeId} />
      </Suspense>
    )
  if (route.kind === 'slides')
    return (
      <Suspense fallback={null}>
        <SlidesApp deckId={route.id} nodeId={route.nodeId} slide={route.slide} presenter={route.presenter} />
      </Suspense>
    )
  return import.meta.env.DEV && location.search.includes('perf') ? (
    <Profiler id="app" onRender={(_, __, ms) => { const p = ((window as any).__perf ??= { commits: 0, ms: 0 }); p.commits++; p.ms += ms }}>
      <App />
    </Profiler>
  ) : <App />
}

export default function Root() { return <><Route /><AppearanceDialog /><WorkspaceStatus /></>; }
