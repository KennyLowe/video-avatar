import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, rmdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectElectronGate } from './_electronGate.js';

// T130 — projects lifecycle. create → rename → duplicate → delete. Delete
// uses shell.trashItem which we stub so the test doesn't actually move the
// folder into the operator's Recycle Bin; we assert the stub was called
// with the expected path, then rm the folder directly.

const gate = detectElectronGate();

const trashItem = vi.fn(async (target: string) => {
  // Simulate the Recycle Bin move by hard-deleting the folder. In real use
  // the folder stays recoverable in the OS trash; the test just needs it gone
  // from the projects root so `listProjects` reflects the deletion.
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
});
const showItemInFolder = vi.fn();

vi.mock('electron', () => ({
  shell: {
    trashItem,
    showItemInFolder,
  },
}));

describe.skipIf(!gate.loadable)('projects lifecycle', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-projects-'));
    trashItem.mockClear();
    showItemInFolder.mockClear();
  });

  afterEach(() => {
    try {
      rmdirSync(tmpRoot, { recursive: true });
    } catch {
      // best effort
    }
  });

  it('creates, renames, duplicates, and deletes a project end-to-end', async () => {
    const {
      createProject,
      listProjects,
      renameProject,
      duplicateProject,
      deleteProject,
    } = await import('@main/data/projects.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    // Create.
    const original = createProject(tmpRoot, 'First project');
    expect(original.slug).toBe('first-project');
    expect(listProjects(tmpRoot)).toHaveLength(1);

    // Rename (metadata-only).
    const renamed = renameProject(tmpRoot, original.slug, 'First Project (Renamed)');
    expect(renamed.slug).toBe(original.slug); // slug is stable
    expect(renamed.name).toBe('First Project (Renamed)');

    // Duplicate.
    const copy = duplicateProject(tmpRoot, original.slug);
    expect(copy.slug).toBe('first-project-copy');
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('First Project (Renamed) (copy)');
    expect(listProjects(tmpRoot)).toHaveLength(2);

    // Delete original via trashItem stub.
    await deleteProject(tmpRoot, original.slug);
    expect(trashItem).toHaveBeenCalledTimes(1);
    const calledWith = trashItem.mock.calls[0]![0] as string;
    expect(calledWith).toBe(path.resolve(tmpRoot, original.slug));
    expect(listProjects(tmpRoot).map((p) => p.slug)).toEqual([copy.slug]);

    closeAllProjectDbs();
  });

  it('disambiguates slug on duplicate when the -copy slug already exists', async () => {
    const { createProject, duplicateProject } = await import('@main/data/projects.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const source = createProject(tmpRoot, 'Clash');
    const first = duplicateProject(tmpRoot, source.slug);
    expect(first.slug).toBe('clash-copy');
    const second = duplicateProject(tmpRoot, source.slug);
    expect(second.slug).toBe('clash-copy-2');

    closeAllProjectDbs();
  });

  it('reveal uses shell.showItemInFolder and surfaces missing-folder clearly', async () => {
    const { createProject, revealInExplorer } = await import('@main/data/projects.js');
    const { closeAllProjectDbs } = await import('@main/data/db.js');

    const project = createProject(tmpRoot, 'Reveal me');
    await revealInExplorer(tmpRoot, project.slug);
    expect(showItemInFolder).toHaveBeenCalledTimes(1);

    await expect(revealInExplorer(tmpRoot, 'does-not-exist')).rejects.toThrow(/No project folder/);

    closeAllProjectDbs();
  });
});
