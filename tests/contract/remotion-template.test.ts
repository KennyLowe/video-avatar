import { describe, expect, it } from 'vitest';
import {
  schema as logoIntroSchema,
  defaultProps as logoIntroDefaults,
} from '../../resources/templates/LogoIntro.js';
import {
  schema as lowerThirdSchema,
  defaultProps as lowerThirdDefaults,
} from '../../resources/templates/LowerThird.js';
import {
  schema as titleSlideSchema,
  defaultProps as titleSlideDefaults,
} from '../../resources/templates/TitleSlide.js';
import {
  schema as chapterCardSchema,
  defaultProps as chapterCardDefaults,
} from '../../resources/templates/ChapterCard.js';
import {
  schema as fullExplainerSchema,
  defaultProps as fullExplainerDefaults,
  durationInFrames as fullExplainerDuration,
  fps as fullExplainerFps,
} from '../../resources/templates/FullExplainer.js';

// Shape check: every bundled template's defaultProps must satisfy its own
// schema. This catches "forgot to update defaults after a schema change"
// regressions before they reach the bundler.

describe('bundled template contract', () => {
  it('LogoIntro defaultProps match its schema', () => {
    expect(logoIntroSchema.safeParse(logoIntroDefaults).success).toBe(true);
  });

  it('LowerThird defaultProps match its schema', () => {
    expect(lowerThirdSchema.safeParse(lowerThirdDefaults).success).toBe(true);
  });

  it('TitleSlide defaultProps match its schema', () => {
    expect(titleSlideSchema.safeParse(titleSlideDefaults).success).toBe(true);
  });

  it('ChapterCard defaultProps match its schema', () => {
    expect(chapterCardSchema.safeParse(chapterCardDefaults).success).toBe(true);
  });

  it('FullExplainer defaultProps match its schema', () => {
    expect(fullExplainerSchema.safeParse(fullExplainerDefaults).success).toBe(true);
  });

  it('FullExplainer durationInFrames is a function of its props', () => {
    expect(typeof fullExplainerDuration).toBe('function');
    const baseline = fullExplainerDuration(fullExplainerDefaults);
    const longer = fullExplainerDuration({
      ...fullExplainerDefaults,
      bodyDurationSeconds: 120,
    });
    expect(longer).toBeGreaterThan(baseline);
    // intro (4 s) + body + outro (3 s) at 30 fps = 7 s + body_frames
    expect(baseline).toBe(120 + Math.round(60 * fullExplainerFps) + 90);
  });

  it('rejects invalid brandColor on LogoIntro', () => {
    const bad = logoIntroSchema.safeParse({
      title: 'X',
      brandColor: 'not a hex',
    });
    expect(bad.success).toBe(false);
  });
});
