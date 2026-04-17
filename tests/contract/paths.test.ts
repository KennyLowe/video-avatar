import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  projectDbPath,
  projectDir,
  projectMetadataPath,
  PROJECT_SUBFOLDERS,
} from '@main/platform/paths.js';

// paths.ts is intentionally a thin layer around path.resolve / path.join —
// this test pins the exact shapes we expose so a future refactor can't
// quietly reintroduce string concatenation.

describe('platform/paths', () => {
  const root = path.resolve(process.platform === 'win32' ? 'C:/projects' : '/tmp/projects');
  const slug = 'demo-project';

  it('projectDir resolves inside the projects root', () => {
    expect(projectDir(root, slug)).toBe(path.resolve(root, slug));
  });

  it('projectMetadataPath points at project.json', () => {
    expect(projectMetadataPath(root, slug)).toBe(path.resolve(root, slug, 'project.json'));
  });

  it('projectDbPath points at state.db', () => {
    expect(projectDbPath(root, slug)).toBe(path.resolve(root, slug, 'state.db'));
  });

  it('exposes the canonical per-project subfolder list', () => {
    expect(PROJECT_SUBFOLDERS).toEqual([
      'audio/takes',
      'audio/tts',
      'video/source',
      'video/segments',
      'video/avatar',
      'scripts',
      'renders',
      'templates',
      'logs',
      'exports',
    ]);
  });
});
