import { handle } from './index.js';
import { getSettings } from '@main/platform/settings.js';
import { openProjectDb } from '@main/data/db.js';
import { JobsRepository } from '@main/data/repositories/jobs.js';
import { listTemplates } from '@main/services/templateLoader.js';
import { generateTemplateProps, validateProps } from '@main/services/templateProps.js';
import { runNow } from '@main/workers/jobQueue.js';
import { logger } from '@main/logging/jsonl.js';
import {
  schema as logoIntroSchema,
  defaultProps as logoIntroDefaults,
} from '../../../resources/templates/LogoIntro.js';
import {
  schema as lowerThirdSchema,
  defaultProps as lowerThirdDefaults,
} from '../../../resources/templates/LowerThird.js';
import {
  schema as titleSlideSchema,
  defaultProps as titleSlideDefaults,
} from '../../../resources/templates/TitleSlide.js';
import {
  schema as chapterCardSchema,
  defaultProps as chapterCardDefaults,
} from '../../../resources/templates/ChapterCard.js';
import {
  schema as fullExplainerSchema,
  defaultProps as fullExplainerDefaults,
} from '../../../resources/templates/FullExplainer.js';
import type { z } from 'zod';

// compose.* IPC surface per FR-038 / FR-039 / FR-040 / FR-041.
// The bundled template schemas are statically imported so we can run
// prompt-to-props + validate-on-edit without spawning Remotion. Render uses
// the dynamic bundle path.

const SCHEMAS: Record<string, { schema: z.ZodType<unknown>; defaultProps: unknown }> = {
  LogoIntro: { schema: logoIntroSchema, defaultProps: logoIntroDefaults },
  LowerThird: { schema: lowerThirdSchema, defaultProps: lowerThirdDefaults },
  TitleSlide: { schema: titleSlideSchema, defaultProps: titleSlideDefaults },
  ChapterCard: { schema: chapterCardSchema, defaultProps: chapterCardDefaults },
  FullExplainer: { schema: fullExplainerSchema, defaultProps: fullExplainerDefaults },
};

export function registerComposeIpc(): void {
  handle('compose.listTemplates', async (input) => {
    const { slug } = (input as { slug: string | null } | undefined) ?? { slug: null };
    const root = getSettings().projectsRoot;
    return listTemplates(root, slug);
  });

  handle('compose.defaultProps', async (input) => {
    const { templateId } = input as { templateId: string };
    const entry = SCHEMAS[templateId];
    if (!entry) throw new Error(`Unknown template: ${templateId}`);
    return entry.defaultProps;
  });

  handle('compose.promptProps', async (input) => {
    const { templateId, userPrompt, startingProps } = input as {
      templateId: string;
      userPrompt: string;
      startingProps: unknown;
    };
    const entry = SCHEMAS[templateId];
    if (!entry) throw new Error(`Unknown template: ${templateId}`);
    return generateTemplateProps({
      schema: entry.schema,
      startingProps: (startingProps ?? entry.defaultProps) as unknown,
      userPrompt,
      templateId,
    });
  });

  handle('compose.validateProps', async (input) => {
    const { templateId, props } = input as { templateId: string; props: unknown };
    const entry = SCHEMAS[templateId];
    if (!entry) throw new Error(`Unknown template: ${templateId}`);
    return validateProps(entry.schema, props);
  });

  handle('compose.render', async (input) => {
    const { slug, templateId, props, settings, scriptId, title } = input as {
      slug: string;
      templateId: string;
      props: unknown;
      settings: {
        resolution: '1080p30' | '1080p60' | '4k30';
        codec: 'h264' | 'h265';
        preset: 'fast' | 'balanced' | 'quality';
        audioBitrate: string;
      };
      scriptId: number | null;
      title: string;
    };
    const root = getSettings().projectsRoot;
    if (root === null) throw new Error('No projects root configured.');
    const entry = SCHEMAS[templateId];
    if (!entry) throw new Error(`Unknown template: ${templateId}`);
    const parsed = entry.schema.safeParse(props);
    if (!parsed.success) {
      throw new Error(`Render refused: props failed schema validation — ${parsed.error.message}`);
    }
    const db = openProjectDb({ projectsRoot: root, slug });
    const jobs = new JobsRepository(db, root, slug);
    const job = jobs.create({
      provider: 'remotion',
      kind: 'render',
      inputRef: JSON.stringify({
        templateId,
        props: parsed.data,
        settings,
        scriptId,
        slug,
        title,
      }),
    });
    void runNow('render', { jobId: job.id, projectsRoot: root, slug }).catch((err) => {
      logger.warn('compose.render handler rejected', {
        jobId: job.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
    return { jobId: job.id };
  });
}
