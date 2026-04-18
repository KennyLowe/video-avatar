import { contextBridge, ipcRenderer } from 'electron';
import type { LumoBridge } from '@shared/ipc-types.js';

// contextIsolation-safe bridge exposing window.lumo.* to the renderer. Each
// channel is typed by LumoBridge in src/shared/ipc-types.ts; handlers live
// in src/main/ipc/.

const bridge: LumoBridge = {
  projects: {
    list: () => ipcRenderer.invoke('projects.list'),
    create: (input) => ipcRenderer.invoke('projects.create', input),
    open: (input) => ipcRenderer.invoke('projects.open', input),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings.get'),
    update: (patch) => ipcRenderer.invoke('settings.update', patch),
    pickProjectsRoot: () => ipcRenderer.invoke('settings.pickProjectsRoot'),
  },
  credentials: {
    status: () => ipcRenderer.invoke('credentials.status'),
    recheckClaudeCode: () => ipcRenderer.invoke('credentials.recheckClaudeCode'),
    test: (input) => ipcRenderer.invoke('credentials.test', input),
    set: (input) => ipcRenderer.invoke('credentials.set', input),
    clear: (input) => ipcRenderer.invoke('credentials.clear', input),
  },
  scripts: {
    list: (input) => ipcRenderer.invoke('scripts.list', input),
    generate: (input) => ipcRenderer.invoke('scripts.generate', input),
    save: (input) => ipcRenderer.invoke('scripts.save', input),
    restore: (input) => ipcRenderer.invoke('scripts.restore', input),
    assist: (input) => ipcRenderer.invoke('scripts.assist', input),
  },
  generate: {
    costPreview: (input) => ipcRenderer.invoke('generate.costPreview', input),
    run: (input) => ipcRenderer.invoke('generate.run', input),
  },
  voices: {
    listStock: () => ipcRenderer.invoke('voices.listStock'),
    list: (input) => ipcRenderer.invoke('voices.list', input),
    listTakes: (input) => ipcRenderer.invoke('voices.listTakes', input),
    saveRecording: (input) => ipcRenderer.invoke('voices.saveRecording', input),
    importFile: (input) => ipcRenderer.invoke('voices.importFile', input),
    markTake: (input) => ipcRenderer.invoke('voices.markTake', input),
    trimTake: (input) => ipcRenderer.invoke('voices.trimTake', input),
    deleteTake: (input) => ipcRenderer.invoke('voices.deleteTake', input),
    minimums: () => ipcRenderer.invoke('voices.minimums'),
    train: (input) => ipcRenderer.invoke('voices.train', input),
    preview: (input) => ipcRenderer.invoke('voices.preview', input),
  },
  avatars: {
    listStock: () => ipcRenderer.invoke('avatars.listStock'),
  },
};

contextBridge.exposeInMainWorld('lumo', bridge);
