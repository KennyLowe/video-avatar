import { useState } from 'react';
import { Home } from './screens/Home.js';
import { Voice } from './screens/Voice.js';
import { Avatar } from './screens/Avatar.js';
import { Script } from './screens/Script.js';
import { Generate } from './screens/Generate.js';
import { Compose } from './screens/Compose.js';
import { Jobs } from './screens/Jobs.js';
import { Settings } from './screens/Settings.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useJobs } from './hooks/useJobs.js';
import { JobsTray } from './components/JobsTray.js';
import { PromptProvider } from './components/PromptProvider.js';

// Routes every screen. Jobs reached via Ctrl+J, Settings via Ctrl+,.
// JobsTray is rendered globally so operators always see pipeline status
// regardless of which screen they're on (FR-043).

type Screen = 'home' | 'voice' | 'avatar' | 'script' | 'generate' | 'compose' | 'jobs' | 'settings';

const SCREEN_LABELS: Record<Screen, string> = {
  home: 'Home',
  voice: 'Voice',
  avatar: 'Avatar',
  script: 'Script',
  generate: 'Generate',
  compose: 'Compose',
  jobs: 'Jobs',
  settings: 'Settings',
};

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const jobsState = useJobs(projectSlug);

  useKeyboardShortcuts([
    { combo: 'mod+0', handler: () => setScreen('home') },
    { combo: 'mod+1', handler: () => projectSlug !== null && setScreen('voice') },
    { combo: 'mod+2', handler: () => projectSlug !== null && setScreen('avatar') },
    { combo: 'mod+3', handler: () => projectSlug !== null && setScreen('script') },
    { combo: 'mod+4', handler: () => projectSlug !== null && setScreen('generate') },
    { combo: 'mod+5', handler: () => projectSlug !== null && setScreen('compose') },
    { combo: 'mod+j', handler: () => setScreen('jobs') },
    { combo: 'mod+,', handler: () => setScreen('settings') },
  ]);

  function renderScreen(): JSX.Element {
    if (projectSlug === null && screen !== 'settings') {
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
        return projectSlug !== null ? <Voice projectSlug={projectSlug} /> : <Home />;
      case 'avatar':
        return projectSlug !== null ? <Avatar projectSlug={projectSlug} /> : <Home />;
      case 'script':
        return projectSlug !== null ? <Script projectSlug={projectSlug} /> : <Home />;
      case 'generate':
        return projectSlug !== null ? <Generate projectSlug={projectSlug} /> : <Home />;
      case 'compose':
        return projectSlug !== null ? <Compose projectSlug={projectSlug} /> : <Home />;
      case 'jobs':
        return (
          <Jobs active={jobsState.active} history={jobsState.history} onCancel={jobsState.cancel} />
        );
      case 'settings':
        return <Settings projectSlug={projectSlug} />;
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
    <PromptProvider>
      <div className="lumo-app">
        {projectSlug !== null ? <TopNav current={screen} onNavigate={setScreen} /> : null}
        {renderScreen()}
        {projectSlug !== null ? (
          <JobsTray
            active={jobsState.active}
            onCancel={jobsState.cancel}
            onOpenPanel={() => setScreen('jobs')}
          />
        ) : null}
      </div>
    </PromptProvider>
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
      <button type="button" onClick={() => onNavigate('jobs')} aria-keyshortcuts="Control+J">
        Jobs <kbd>Ctrl+J</kbd>
      </button>
      <button type="button" onClick={() => onNavigate('settings')} aria-keyshortcuts="Control+,">
        Settings <kbd>Ctrl+,</kbd>
      </button>
      <span className="lumo-muted">current: {SCREEN_LABELS[current]}</span>
    </nav>
  );
}
