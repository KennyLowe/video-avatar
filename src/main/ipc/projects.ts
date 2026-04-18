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

  handle('projects.rename', async (input) => {
    const { slug, newName } = input as { slug: string; newName: string };
    if (newName.trim().length === 0) throw new Error('Project name cannot be empty.');
    const root = requireProjectsRoot();
    return projects.renameProject(root, slug, newName.trim());
  });

  handle('projects.duplicate', async (input) => {
    const { slug } = input as { slug: string };
    const root = requireProjectsRoot();
    return projects.duplicateProject(root, slug);
  });

  handle('projects.delete', async (input) => {
    const { slug, confirmName } = input as { slug: string; confirmName: string };
    const root = requireProjectsRoot();
    // Two-step delete confirmation gate (FR-009). The renderer asks the
    // operator to re-type the project name; we re-verify here before
    // touching the filesystem.
    const project = projects.openProject(root, slug);
    if (project.name !== confirmName) {
      throw new Error(
        `Delete refused: typed name "${confirmName}" does not match project name "${project.name}".`,
      );
    }
    await projects.deleteProject(root, slug);
    return { recycled: true as const };
  });

  handle('projects.revealInExplorer', async (input) => {
    const { slug } = input as { slug: string };
    const root = requireProjectsRoot();
    await projects.revealInExplorer(root, slug);
  });
}

function requireProjectsRoot(): string {
  const root = getSettings().projectsRoot;
  if (root === null) {
    throw new Error('No projects root configured. Pick one from Settings first.');
  }
  return root;
}
