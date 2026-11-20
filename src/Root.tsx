import { lazy, Profiler, Suspense, useEffect } from 'react'
import WorkspaceStatus from './components/WorkspaceStatus.tsx'
import AppearanceDialog from './components/AppearanceDialog'
import ProductNav from './components/ProductNav'
import { useDiagram } from './store'

import { nameProductWindow, parseRoute, useHash } from './route.ts'

const App = lazy(() => import('./App.tsx'))
const WikiApp = lazy(() => import('./wiki/WikiApp.tsx'))
const SlidesApp = lazy(() => import('./slides/SlidesApp.tsx'))
const DocsApp = lazy(() => import('./docs/DocsApp.tsx'))

function Route({ route, showWelcome }: { route: ReturnType<typeof parseRoute>; showWelcome: boolean }) {
  if (route.kind === 'docs') return <DocsApp />
  if (route.kind === 'wiki')
    return <WikiApp pageId={route.id} nodeId={route.nodeId} />
  if (route.kind === 'slides')
    return <SlidesApp deckId={route.id} nodeId={route.nodeId} slide={route.slide} presenter={route.presenter} />
  return import.meta.env.DEV && location.search.includes('perf') ? (
    <Profiler id="app" onRender={(_, __, ms) => { const p = ((window as any).__perf ??= { commits: 0, ms: 0 }); p.commits++; p.ms += ms }}>
      <App showWelcome={showWelcome} />
    </Profiler>
  ) : <App showWelcome={showWelcome} />
}

export default function Root({ showWelcome }: { showWelcome: boolean }) {
  const route = parseRoute(useHash())
  const product = route.kind === 'node' ? 'canvas' : route.kind
  const presenting = useDiagram(state =>
    route.kind === 'slides' && !!route.slide && state.decks.some(deck => deck.id === route.id))
  useEffect(() => {
    nameProductWindow(product)
    if (product === 'canvas') document.title = 'Diagrams · marmerlade'
  }, [product])
  return <>
    {product !== 'docs' && !presenting && !window.__marmerladeRender && <ProductNav current={product} />}
    <Suspense fallback={null}><Route route={route} showWelcome={showWelcome} /></Suspense>
    {product !== 'canvas' && <AppearanceDialog />}
    <WorkspaceStatus />
  </>
}
