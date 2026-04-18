import { useState } from 'react';
import { Home } from './screens/Home.js';
import { Voice } from './screens/Voice.js';
import { Avatar } from './screens/Avatar.js';
import { Script } from './screens/Script.js';
import { Generate } from './screens/Generate.js';
import { Compose } from './screens/Compose.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';

// Routes Home ↔ Voice ↔ Avatar ↔ Script ↔ Generate ↔ Compose. Jobs / Settings
// arrive with their respective user stories.

type Screen = 'home' | 'voice' | 'avatar' | 'script' | 'generate' | 'compose';

const SCREEN_LABELS: Record<Screen, string> = {
  home: 'Home',
  voice: 'Voice',
  avatar: 'Avatar',
  script: 'Script',
  generate: 'Generate',
  compose: 'Compose',
};

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [projectSlug, setProjectSlug] = useState<string | null>(null);

  useKeyboardShortcuts([
    { combo: 'mod+0', handler: () => setScreen('home') },
    { combo: 'mod+1', handler: () => projectSlug !== null && setScreen('voice') },
    { combo: 'mod+2', handler: () => projectSlug !== null && setScreen('avatar') },
    { combo: 'mod+3', handler: () => projectSlug !== null && setScreen('script') },
    { combo: 'mod+4', handler: () => projectSlug !== null && setScreen('generate') },
    { combo: 'mod+5', handler: () => projectSlug !== null && setScreen('compose') },
  ]);

  function renderScreen(): JSX.Element {
    if (projectSlug === null) {
      return (
        <Home
          onOpenProject={(slug) => {
            setProjectSlug(slug);
            setScreen('script');
          }}
        />
      );
    }
    switch (screen) {
      case 'voice':
        return <Voice projectSlug={projectSlug} />;
      case 'avatar':
        return <Avatar projectSlug={projectSlug} />;
      case 'script':
        return <Script projectSlug={projectSlug} />;
      case 'generate':
        return <Generate projectSlug={projectSlug} />;
      case 'compose':
        return <Compose projectSlug={projectSlug} />;
      default:
        return (
          <Home
            onOpenProject={(slug) => {
              setProjectSlug(slug);
              setScreen('script');
            }}
          />
        );
    }
  }

  return (
    <div className="lumo-app">
      {projectSlug !== null ? <TopNav current={screen} onNavigate={setScreen} /> : null}
      {renderScreen()}
    </div>
  );
}

function TopNav({
  current,
  onNavigate,
}: {
  current: Screen;
  onNavigate: (next: Screen) => void;
}): JSX.Element {
  return (
    <nav className="lumo-topnav">
      <button type="button" onClick={() => onNavigate('home')} aria-keyshortcuts="Control+0">
        Home <kbd>Ctrl+0</kbd>
      </button>
      <button type="button" onClick={() => onNavigate('voice')} aria-keyshortcuts="Control+1">
        Voice <kbd>Ctrl+1</kbd>
      </button>
      <button type="button" onClick={() => onNavigate('avatar')} aria-keyshortcuts="Control+2">
        Avatar <kbd>Ctrl+2</kbd>
      </button>
      <button type="button" onClick={() => onNavigate('script')} aria-keyshortcuts="Control+3">
        Script <kbd>Ctrl+3</kbd>
      </button>
      <button type="button" onClick={() => onNavigate('generate')} aria-keyshortcuts="Control+4">
        Generate <kbd>Ctrl+4</kbd>
      </button>
      <button type="button" onClick={() => onNavigate('compose')} aria-keyshortcuts="Control+5">
        Compose <kbd>Ctrl+5</kbd>
      </button>
      <span className="lumo-muted">current: {SCREEN_LABELS[current]}</span>
    </nav>
  );
}
