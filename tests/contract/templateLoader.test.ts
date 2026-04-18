import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Test the validity-check regex logic in templateLoader.buildInfo by pointing
// it at a synthetic directory of .tsx files. We stub `electron.app.isPackaged`
// and `getAppPath` so the loader resolves into our fixture directory.

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '',
  },
}));

// Import AFTER the mock is set up.
const { listTemplates } = await import('@main/services/templateLoader.js');

describe('templateLoader.listTemplates', () => {
  it('marks a template missing required exports as invalid', () => {
    const tmp = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-loader-'));
    const resourcesDir = path.resolve(tmp, 'resources', 'templates');
    mkdirSync(resourcesDir, { recursive: true });
    writeFileSync(
      path.resolve(resourcesDir, 'Broken.tsx'),
      `export const schema = null;
       export const defaultProps = {};
       // Missing: durationInFrames, fps, Composition
      `,
      'utf-8',
    );
    writeFileSync(
      path.resolve(resourcesDir, 'Ok.tsx'),
      `export const schema = null;
       export const defaultProps = {};
       export const durationInFrames = 60;
       export const fps = 30;
       export const Composition = () => null;
      `,
      'utf-8',
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      const infos = listTemplates(null, null);
      const broken = infos.find((t) => t.id === 'Broken');
      const ok = infos.find((t) => t.id === 'Ok');
      expect(broken?.validity.kind).toBe('invalid-missing-export');
      if (broken && broken.validity.kind === 'invalid-missing-export') {
        expect(['durationInFrames', 'fps', 'Composition']).toContain(broken.validity.missing);
      }
      expect(ok?.validity).toEqual({ kind: 'valid' });
    } finally {
      cwdSpy.mockRestore();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports per-project custom templates as invalid-custom-unsupported', () => {
    const tmp = mkdtempSync(path.resolve(os.tmpdir(), 'lumo-loader-proj-'));
    const resourcesDir = path.resolve(tmp, 'resources', 'templates');
    mkdirSync(resourcesDir, { recursive: true });

    const projectsRoot = path.resolve(tmp, 'projects');
    const projectDir = path.resolve(projectsRoot, 'my-project');
    const customDir = path.resolve(projectDir, 'templates');
    mkdirSync(customDir, { recursive: true });
    writeFileSync(
      path.resolve(customDir, 'Custom.tsx'),
      `export const schema = null;
       export const defaultProps = {};
       export const durationInFrames = 60;
       export const fps = 30;
       export const Composition = () => null;
      `,
      'utf-8',
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      const infos = listTemplates(projectsRoot, 'my-project');
      const custom = infos.find((t) => t.id === 'Custom');
      expect(custom?.isCustom).toBe(true);
      expect(custom?.validity.kind).toBe('invalid-custom-unsupported');
    } finally {
      cwdSpy.mockRestore();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
