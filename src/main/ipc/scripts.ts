import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { ScriptsRepository } from '@main/data/repositories/scripts.js';
import * as claudeCode from '@main/providers/claudeCode.js';
import {
  SCRIPT_SYSTEM_PROMPT,
  buildScriptPrompt,
  type ScriptTone,
} from '@main/services/scriptPrompt.js';
import { ScriptResponseSchema } from '@shared/schemas/script.js';
import {
  ASSIST_ACTIONS,
  buildAssistPrompts,
  type AssistAction,
} from '@main/services/assistPrompts.js';

// scripts.* IPC surface per contracts/ipc-bridge.md.
// FR-010 generate, FR-013 assist, FR-014 save/restore as immutable versions.

export function registerScriptsIpc(): void {
  handle('scripts.list', async (input) => {
    const { slug } = input as { slug: string };
    const repo = openRepo(slug);
    return repo.list();
  });

  handle('scripts.generate', async (input) => {
    const { prompt, tone, targetDurationSeconds } = input as {
      prompt: string;
      tone: ScriptTone;
      targetDurationSeconds: number;
    };
    const userPrompt = buildScriptPrompt({ prompt, tone, targetDurationSeconds });
    const result = await claudeCode.invoke<unknown>({
      model: getSettings().defaultClaudeModel,
      systemPrompt: SCRIPT_SYSTEM_PROMPT,
      prompt: userPrompt,
      outputFormat: 'json',
    });
    return ScriptResponseSchema.parse(result.parsed);
  });

  handle('scripts.save', async (input) => {
    const {
      slug: projectSlug,
      id,
      bodyMd,
      title,
      estimatedSeconds,
    } = input as {
      slug: string;
      id: number | null;
      bodyMd: string;
      title: string;
      estimatedSeconds: number;
    };
    const repo = openRepo(projectSlug);
    const currentSlug = slugify(title);
    return repo.save({
      slug: currentSlug,
      title,
      bodyMd,
      estimatedSeconds,
      parentVersionId: id,
    });
  });

  handle('scripts.restore', async (input) => {
    const { slug: projectSlug, versionId } = input as { slug: string; versionId: number };
    const repo = openRepo(projectSlug);
    const existing = repo.get(versionId);
    if (existing === null) {
      throw new Error(`No script version with id ${versionId}`);
    }
    return repo.save({
      slug: existing.slug,
      title: existing.title,
      bodyMd: existing.bodyMd,
      estimatedSeconds: existing.estimatedSeconds,
      parentVersionId: existing.id,
    });
  });

  handle('scripts.assist', async (input) => {
    const { action, selection } = input as { action: AssistAction; selection: string };
    if (!ASSIST_ACTIONS.some((a) => a.id === action)) {
      throw new Error(`Unknown assist action: ${action}`);
    }
    const { systemPrompt, userPrompt } = buildAssistPrompts(action, selection);
    const result = await claudeCode.invoke<unknown>({
      model: getSettings().defaultClaudeModel,
      systemPrompt,
      prompt: userPrompt,
      outputFormat: 'text',
    });
    return { replacement: String(result.parsed).trim() };
  });
}

function openRepo(projectSlug: string): ScriptsRepository {
  const root = getSettings().projectsRoot;
  if (root === null) throw new Error('No projects root configured.');
  const db = openProjectDb({ projectsRoot: root, slug: projectSlug });
  return new ScriptsRepository(db, root, projectSlug);
}

function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'script';
}
