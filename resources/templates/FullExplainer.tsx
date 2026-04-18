import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { Composition as LogoIntroComposition, schema as logoIntroSchema } from './LogoIntro.js';
import { Composition as TitleSlideComposition, schema as titleSlideSchema } from './TitleSlide.js';

// Assembled composition: intro → avatar-clip body → outro.
// Duration depends on the avatar clip's length; we return a function from
// `durationInFrames` so Remotion can size the composition dynamically.

export const id = 'FullExplainer';
export const displayName = 'Full explainer (intro + body + outro)';
export const description =
  'Logo intro, avatar clip body, title-slide outro. Body duration drives the total length.';

const chapterSchema = z.object({
  title: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
});

export const schema = z.object({
  avatarClipPath: z
    .string()
    .describe(
      'Absolute path to the avatar MP4. Empty string renders a placeholder body — used for preview before a clip is selected.',
    ),
  bodyDurationSeconds: z.number().positive(),
  intro: logoIntroSchema,
  outro: titleSlideSchema,
  chapters: z.array(chapterSchema).optional(),
});
export type FullExplainerProps = z.infer<typeof schema>;

export const defaultProps: FullExplainerProps = {
  avatarClipPath: '',
  bodyDurationSeconds: 60,
  intro: {
    title: 'Lumo',
    subtitle: 'your video, your voice',
    brandColor: '#1b73e8',
  },
  outro: {
    heading: 'Thanks for watching',
    backgroundColor: '#0b0d10',
  },
};

export const fps = 30;
export const width = 1920;
export const height = 1080;

const INTRO_FRAMES = 120;
const OUTRO_FRAMES = 90;

export const durationInFrames = (props: FullExplainerProps): number => {
  const body = Math.max(1, Math.round(props.bodyDurationSeconds * fps));
  return INTRO_FRAMES + body + OUTRO_FRAMES;
};

export const Composition: React.FC<FullExplainerProps> = (props) => {
  const bodyFrames = Math.max(1, Math.round(props.bodyDurationSeconds * fps));
  const frame = useCurrentFrame();
  const bodyStart = INTRO_FRAMES;
  const bodyEnd = INTRO_FRAMES + bodyFrames;

  // Dip the body's sound / picture for the last 6 frames as the outro
  // crossfades in.
  const bodyOpacity = interpolate(
    frame,
    [bodyStart, bodyStart + 6, bodyEnd - 6, bodyEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <LogoIntroComposition {...props.intro} />
      </Sequence>

      <Sequence from={bodyStart} durationInFrames={bodyFrames}>
        <AbsoluteFill style={{ opacity: bodyOpacity }}>
          {props.avatarClipPath.length > 0 ? (
            <OffthreadVideo src={`file://${props.avatarClipPath.replace(/\\/g, '/')}`} />
          ) : (
            <AbsoluteFill
              style={{
                backgroundColor: '#15191e',
                color: '#8a9199',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              (avatar clip goes here)
            </AbsoluteFill>
          )}
        </AbsoluteFill>
      </Sequence>

      <Sequence from={bodyEnd} durationInFrames={OUTRO_FRAMES}>
        <TitleSlideComposition {...props.outro} />
      </Sequence>
    </AbsoluteFill>
  );
};
