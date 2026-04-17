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
  },
};

contextBridge.exposeInMainWorld('lumo', bridge);
