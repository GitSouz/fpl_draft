import { useEffect, useState } from 'react';
import { onlineEnabled } from './online/supabase';
import { loadSession } from './online/session';
import Landing from './online/Landing';
import LocalApp from './LocalApp';
import OnlineApp from './online/OnlineApp';
import Dashboard from './league/Dashboard';

type Mode = 'choose' | 'local' | 'online';

// The league dashboard lives at #league so it can be bookmarked and shared
// independently of the draft tools. (?league=… links from earlier still work;
// the dashboard always shows the one fixed league.)
const wantsDashboard = () =>
  window.location.hash === '#league' || new URLSearchParams(window.location.search).has('league');

export default function App() {
  const [dashboard, setDashboard] = useState(wantsDashboard);

  useEffect(() => {
    const onHash = () => setDashboard(wantsDashboard());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openDashboard = () => {
    window.location.hash = 'league';
    setDashboard(true);
  };
  const closeDashboard = () => {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('league');
    window.history.replaceState(null, '', url);
    setDashboard(false);
  };

  if (dashboard) return <Dashboard onBack={closeDashboard} />;

  // If online isn't configured, there's nothing to choose — go straight to the
  // local app (unchanged behaviour).
  if (!onlineEnabled) {
    return <LocalApp onDashboard={openDashboard} />;
  }
  return <RoutedApp onDashboard={openDashboard} />;
}

function RoutedApp({ onDashboard }: { onDashboard: () => void }) {
  // Resume straight into an online draft if this browser is already in one.
  const [mode, setMode] = useState<Mode>(() => (loadSession() ? 'online' : 'choose'));

  if (mode === 'local') return <LocalApp onBack={() => setMode('choose')} />;
  if (mode === 'online') return <OnlineApp onExitToMenu={() => setMode('choose')} />;
  return (
    <Landing onLocal={() => setMode('local')} onOnline={() => setMode('online')} onDashboard={onDashboard} />
  );
}
