import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { App } from './App.js';
import './main.css';

// @monaco-editor/react defaults to loading Monaco from jsdelivr CDN via a
// <script> tag. Our CSP says script-src 'self', which blocks that. Pass
// the bundled monaco module directly — Vite tree-shakes what we actually
// use, and nothing ever leaves the app.
loader.config({ monaco });

// Skip web-worker loading. Monaco normally spawns language workers for
// JSON/TS/CSS etc.; those are loaded from separate JS files, which Vite
// doesn't serve out of the box under CSP. We use Monaco for a prompt
// editor and a small props-JSON editor — main-thread fallback is fine
// and avoids another round of CSP tuning.
(window as unknown as { MonacoEnvironment?: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => {
    const blob = new Blob(
      ['self.onmessage = () => {};'],
      { type: 'text/javascript' },
    );
    return new Worker(URL.createObjectURL(blob));
  },
};

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Renderer mount point <div id="root"> missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
