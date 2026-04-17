import { Home } from './screens/Home.js';

// Phase 2 renderer is a single-screen shell. A real router lands in Phase 3+
// once Voice/Avatar/Script/Generate/Compose/Jobs/Settings screens come
// online. The keyboard-shortcut layer (useKeyboardShortcuts) already supports
// `Ctrl+0..5`, `Ctrl+J`, `Ctrl+,` but they're no-ops until screens exist.

export function App(): JSX.Element {
  return <Home />;
}
