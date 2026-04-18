import { useState } from 'react';
import { Home } from './screens/Home.js';
import { Script } from './screens/Script.js';
import { Generate } from './screens/Generate.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';

// Phase 3 renderer adds routing between Home, Script, and Generate. Full
// router (Voice, Avatar, Compose, Jobs, Settings) arrives with their
// respective user stories. Ctrl+0..5 mapping stays consistent.

type Screen = 'home' | 'script' | 'generate';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [projectSlug, setProjectSlug] = useState<string | null>(null);

  useKeyboardShortcuts([
    { combo: 'mod+0', handler: () => setScreen('home') },
    { combo: 'mod+3', handler: () => projectSlug !== null && setScreen('script') },
    { combo: 'mod+4', handler: () => projectSlug !== null && setScreen('generate') },
  ]);

  if (screen === 'script' && projectSlug !== null) {
    return (
      <div className="lumo-app">
        <TopNav onHome={() => setScreen('home')} current="script" />
        <Script projectSlug={projectSlug} />
      </div>
    );
  }
  if (screen === 'generate' && projectSlug !== null) {
    return (
      <div className="lumo-app">
        <TopNav onHome={() => setScreen('home')} current="generate" />
        <Generate projectSlug={projectSlug} />
      </div>
    );
  }

  return (
    <div className="lumo-app">
      <Home
        onOpenProject={(slug) => {
          setProjectSlug(slug);
          setScreen('script');
        }}
      />
    </div>
  );
}

function TopNav({ onHome, current }: { onHome: () => void; current: Screen }): JSX.Element {
  return (
    <nav className="lumo-topnav">
      <button type="button" onClick={onHome} aria-keyshortcuts="Control+0">
        Home <kbd>Ctrl+0</kbd>
      </button>
      <span className="lumo-muted">{current}</span>
    </nav>
  );
}
