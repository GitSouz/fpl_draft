import { useState } from 'react';
import { onlineEnabled } from './online/supabase';
import { loadSession } from './online/session';
import Landing from './online/Landing';
import LocalApp from './LocalApp';
import OnlineApp from './online/OnlineApp';

type Mode = 'choose' | 'local' | 'online';

export default function App() {
  // If online isn't configured, there's nothing to choose — go straight to the
  // local app (unchanged behaviour).
  if (!onlineEnabled) {
    return <LocalApp />;
  }
  return <RoutedApp />;
}

function RoutedApp() {
  // Resume straight into an online draft if this browser is already in one.
  const [mode, setMode] = useState<Mode>(() => (loadSession() ? 'online' : 'choose'));

  if (mode === 'local') return <LocalApp onBack={() => setMode('choose')} />;
  if (mode === 'online') return <OnlineApp onExitToMenu={() => setMode('choose')} />;
  return (
    <Landing onLocal={() => setMode('local')} onOnline={() => setMode('online')} />
  );
}
