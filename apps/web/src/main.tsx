import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { RealtimeProvider } from './lib/realtime';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import './styles.css';
const GamePage = lazy(() =>
  import('./pages/GamePage').then((module) => ({ default: module.GamePage })),
);
const RoomPage = lazy(() =>
  import('./pages/RoomPage').then((module) => ({ default: module.RoomPage })),
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RealtimeProvider>
        <Suspense
          fallback={
            <main className="page-container empty-state" role="status">
              <h2>On prépare votre petit moment…</h2>
            </main>
          }
        >
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="games/:gameId" element={<GamePage />} />
              <Route path="games/:gameId/rooms/:code" element={<RoomPage />} />
              <Route
                path="*"
                element={
                  <main className="empty-state">
                    <h1>On s’est un peu égarés.</h1>
                    <p>Votre prochain bon moment est juste à côté.</p>
                    <Link className="button" to="/">
                      Retrouver la collection
                    </Link>
                  </main>
                }
              />
            </Route>
          </Routes>
        </Suspense>
      </RealtimeProvider>
    </BrowserRouter>
  </StrictMode>,
);
