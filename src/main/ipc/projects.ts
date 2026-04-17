import { handle } from './index.js';
import * as projects from '@main/data/projects.js';
import { getSettings } from '@main/platform/settings.js';

// Phase 2 foundational surface only: list / create / open. rename, duplicate,
// delete, revealInExplorer arrive in Phase 7 US5 (T117).

export function registerProjectsIpc(): void {
  handle('projects.list', async () => {
    const root = getSettings().projectsRoot;
    if (root === null) return [];
    return projects.listProjects(root);
  });

  handle('projects.create', async (input) => {
    const { name } = input as { name: string };
    const root = requireProjectsRoot();
    return projects.createProject(root, name);
  });

  handle('projects.open', async (input) => {
    const { slug } = input as { slug: string };
    const root = requireProjectsRoot();
    return projects.openProject(root, slug);
  });
}

function requireProjectsRoot(): string {
  const root = getSettings().projectsRoot;
  if (root === null) {
    throw new Error('No projects root configured. Pick one from Settings first.');
  }
  return root;
}
