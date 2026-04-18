import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
  cpSync,
} from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { shell } from 'electron';
import { ProjectSchema, type Project, type ProjectSummary } from '@shared/schemas/project.js';
import { PROJECT_SUBFOLDERS, projectDir, projectMetadataPath } from '@main/platform/paths.js';
import { closeProjectDb, openProjectDb } from './db.js';

// Project metadata lives on disk as `<project>/project.json`. The SQLite file
// is the operational state; `project.json` is the durable descriptor we expect
// a human to look at.

export function listProjects(projectsRoot: string): ProjectSummary[] {
  if (!existsSync(projectsRoot)) return [];
  const entries = readdirSync(projectsRoot, { withFileTypes: true });
  const summaries: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metadataPath = projectMetadataPath(projectsRoot, entry.name);
    if (!existsSync(metadataPath)) continue;
    try {
      const project = ProjectSchema.parse(JSON.parse(readFileSync(metadataPath, 'utf-8')));
      summaries.push({
        id: project.id,
        name: project.name,
        slug: project.slug,
        createdAt: project.createdAt,
        projectPath: projectDir(projectsRoot, project.slug),
        lastModifiedAt: new Date(statSync(metadataPath).mtimeMs).toISOString(),
        lastRenderThumbnail: null,
      });
    } catch {
      // Skip folders that happen to contain a malformed project.json rather
      // than deleting them — could be the operator's in-progress rename.
    }
  }
  return summaries.sort((a, b) => (b.lastModifiedAt ?? '').localeCompare(a.lastModifiedAt ?? ''));
}

export function createProject(projectsRoot: string, name: string): Project {
  const slug = disambiguateSlug(projectsRoot, slugify(name));
  const folder = projectDir(projectsRoot, slug);
  if (existsSync(folder)) {
    throw new Error(`Project folder already exists: ${folder}`);
  }
  mkdirSync(folder, { recursive: true });
  for (const sub of PROJECT_SUBFOLDERS) {
    mkdirSync(path.resolve(folder, sub), { recursive: true });
  }

  const project: Project = {
    id: randomUUID(),
    name,
    slug,
    createdAt: new Date().toISOString(),
    defaultVoiceId: null,
    defaultAvatarId: null,
  };
  writeFileSync(projectMetadataPath(projectsRoot, slug), JSON.stringify(project, null, 2), 'utf-8');

  // Materialise the SQLite file with all migrations applied.
  openProjectDb({ projectsRoot, slug });
  return project;
}

export function openProject(projectsRoot: string, slug: string): Project {
  const meta = projectMetadataPath(projectsRoot, slug);
  if (!existsSync(meta)) {
    throw new Error(`No project at ${meta}`);
  }
  const project = ProjectSchema.parse(JSON.parse(readFileSync(meta, 'utf-8')));
  openProjectDb({ projectsRoot, slug });
  return project;
}

export function writeProject(projectsRoot: string, project: Project): void {
  writeFileSync(
    projectMetadataPath(projectsRoot, project.slug),
    JSON.stringify(project, null, 2),
    'utf-8',
  );
}

export function renameProject(projectsRoot: string, slug: string, newName: string): Project {
  const meta = projectMetadataPath(projectsRoot, slug);
  if (!existsSync(meta)) throw new Error(`No project at ${meta}`);
  const project = ProjectSchema.parse(JSON.parse(readFileSync(meta, 'utf-8')));
  const next: Project = { ...project, name: newName };
  writeProject(projectsRoot, next);
  return next;
}

/**
 * Duplicate a project: copy its folder to a new slug-disambiguated path,
 * rewrite project.json with a fresh id and the source name + " (copy)",
 * and return the new project metadata. The SQLite file is copied verbatim.
 */
export function duplicateProject(projectsRoot: string, slug: string): Project {
  const source = projectDir(projectsRoot, slug);
  if (!existsSync(source)) throw new Error(`No project folder at ${source}`);

  // Close the source DB so the file isn't locked.
  closeProjectDb({ projectsRoot, slug });

  const sourceProject = ProjectSchema.parse(
    JSON.parse(readFileSync(projectMetadataPath(projectsRoot, slug), 'utf-8')),
  );
  const newSlug = disambiguateSlug(projectsRoot, `${sourceProject.slug}-copy`);
  const dest = projectDir(projectsRoot, newSlug);

  cpSync(source, dest, { recursive: true });

  const next: Project = {
    ...sourceProject,
    id: randomUUID(),
    slug: newSlug,
    name: `${sourceProject.name} (copy)`,
    createdAt: new Date().toISOString(),
  };
  writeProject(projectsRoot, next);
  return next;
}

/**
 * Soft-delete: close the DB, move the entire project folder to the OS
 * recycle/trash facility. FR-009 requires that the operator can recover
 * the folder from the Recycle Bin — never hard-delete.
 */
export async function deleteProject(projectsRoot: string, slug: string): Promise<void> {
  const dir = projectDir(projectsRoot, slug);
  if (!existsSync(dir)) return;
  closeProjectDb({ projectsRoot, slug });
  await shell.trashItem(dir);
}

export async function revealInExplorer(projectsRoot: string, slug: string): Promise<void> {
  const dir = projectDir(projectsRoot, slug);
  if (!existsSync(dir)) throw new Error(`No project folder at ${dir}`);
  shell.showItemInFolder(path.resolve(dir, 'project.json'));
}

// --- helpers -----------------------------------------------------------

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'project';
}

function disambiguateSlug(projectsRoot: string, base: string): string {
  if (!existsSync(projectDir(projectsRoot, base))) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!existsSync(projectDir(projectsRoot, candidate))) return candidate;
  }
  throw new Error(`Could not disambiguate slug "${base}"`);
}
