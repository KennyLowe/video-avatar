import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { z } from 'zod';

// Single title slide with a heading and a subheading. 3 s hold.

export const id = 'TitleSlide';
export const displayName = 'Title slide';
export const description = 'One heading + one subheading, centred, 3 s.';

export const schema = z.object({
  heading: z.string().min(1),
  subheading: z.string().optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'backgroundColor must be a 7-char hex literal'),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'textColor must be a 7-char hex literal')
    .optional(),
});
export type TitleSlideProps = z.infer<typeof schema>;

export const defaultProps: TitleSlideProps = {
  heading: 'Chapter one',
  subheading: 'setting up the pipeline',
  backgroundColor: '#0b0d10',
  textColor: '#ffffff',
};

export const durationInFrames = 90;
export const fps = 30;
export const width = 1920;
export const height = 1080;

export const Composition: React.FC<TitleSlideProps> = ({
  heading,
  subheading,
  backgroundColor,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 78, 90], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        color: textColor ?? '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        opacity,
      }}
    >
      <div style={{ fontSize: 112, fontWeight: 600, textAlign: 'center' }}>{heading}</div>
      {subheading ? (
        <div style={{ fontSize: 44, marginTop: 28, opacity: 0.75, textAlign: 'center' }}>
          {subheading}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
