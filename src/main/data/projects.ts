import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectSchema, type Project, type ProjectSummary } from '@shared/schemas/project.js';
import { PROJECT_SUBFOLDERS, projectDir, projectMetadataPath } from '@main/platform/paths.js';
import { openProjectDb } from './db.js';

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
