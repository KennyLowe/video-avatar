import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { logger } from '@main/logging/jsonl.js';
import { projectDir } from '@main/platform/paths.js';

// Template discovery + lightweight validity check.
//
// Phase 6 ships bundled templates only (FR-036). Per-project custom
// templates under <project>/templates/ are discovered and reported as
// `invalid-custom-unsupported` — the FR-038 contract (operator can drop
// .tsx files) is deferred to a Phase-7 iteration because it needs dynamic
// Root.tsx synthesis + per-project bundling, which is real complexity.
// When the infra lands, this module is where it plugs in.

export type TemplateValidity =
  | { kind: 'valid' }
  | { kind: 'invalid-missing-export'; missing: string }
  | { kind: 'invalid-custom-unsupported' };

export interface TemplateInfo {
  id: string;
  sourcePath: string;
  displayName: string;
  description: string;
  isCustom: boolean;
  validity: TemplateValidity;
}

const REQUIRED_EXPORTS: readonly string[] = [
  'schema',
  'defaultProps',
  'durationInFrames',
  'fps',
  'Composition',
];

/** Resolve the bundled-templates directory whether we're running packaged
 *  (unpacked extraResource) or in dev (from the repo root). */
function bundledTemplatesDir(): string {
  if (app.isPackaged) {
    return path.resolve(process.resourcesPath, 'templates');
  }
  // `app.getAppPath()` in dev points at the Vite-served app root; the
  // templates sit at `<repo>/resources/templates`. Walk up from the app
  // path until we find it; fall back to cwd.
  const candidate = path.resolve(app.getAppPath(), '..', 'resources', 'templates');
  if (existsSync(candidate)) return candidate;
  return path.resolve(process.cwd(), 'resources', 'templates');
}

/** Entry file passed to @remotion/bundler. */
export function bundledRootPath(): string {
  return path.resolve(bundledTemplatesDir(), 'Root.tsx');
}

export function listTemplates(projectsRoot: string | null, slug: string | null): TemplateInfo[] {
  const infos: TemplateInfo[] = [];

  const bundledDir = bundledTemplatesDir();
  if (existsSync(bundledDir)) {
    for (const file of readdirSync(bundledDir)) {
      if (!file.endsWith('.tsx')) continue;
      if (file === 'Root.tsx') continue;
      const sourcePath = path.resolve(bundledDir, file);
      infos.push(buildInfo(sourcePath, false));
    }
  }

  if (projectsRoot !== null && slug !== null) {
    const customDir = path.resolve(projectDir(projectsRoot, slug), 'templates');
    if (existsSync(customDir)) {
      for (const file of readdirSync(customDir)) {
        if (!file.endsWith('.tsx')) continue;
        const sourcePath = path.resolve(customDir, file);
        infos.push({
          ...buildInfo(sourcePath, true),
          validity: { kind: 'invalid-custom-unsupported' },
        });
      }
    }
  }

  return infos;
}

function buildInfo(sourcePath: string, isCustom: boolean): TemplateInfo {
  const id = path.basename(sourcePath, '.tsx');
  let source = '';
  try {
    source = readFileSync(sourcePath, 'utf-8');
  } catch (err) {
    logger.warn('templateLoader.read_failed', {
      sourcePath,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const missing = REQUIRED_EXPORTS.find((name) => !hasExport(source, name));
  const validity: TemplateValidity =
    missing !== undefined ? { kind: 'invalid-missing-export', missing } : { kind: 'valid' };
  return {
    id,
    sourcePath,
    displayName: readStringConst(source, 'displayName') ?? id,
    description: readStringConst(source, 'description') ?? '',
    isCustom,
    validity,
  };
}

/** Lightweight regex-based check — full validation happens at bundle time. */
function hasExport(source: string, name: string): boolean {
  const re = new RegExp(
    `export\\s+(?:const|let|var|function|async\\s+function|type|interface)\\s+${name}\\b`,
  );
  return re.test(source);
}

function readStringConst(source: string, name: string): string | null {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(['"\`])([^'"\`]+)\\1`);
  const match = re.exec(source);
  return match ? (match[2] ?? null) : null;
}
