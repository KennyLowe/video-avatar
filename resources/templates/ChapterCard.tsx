import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { z } from 'zod';

// Full-screen chapter marker. Large number, title, brief subtitle.

export const id = 'ChapterCard';
export const displayName = 'Chapter card';
export const description = 'Full-screen chapter marker: number + title + one line.';

export const schema = z.object({
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  chapterSubtitle: z.string().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'brandColor must be a 7-char hex literal'),
});
export type ChapterCardProps = z.infer<typeof schema>;

export const defaultProps: ChapterCardProps = {
  chapterNumber: 1,
  chapterTitle: 'Setup',
  chapterSubtitle: 'install, configure, sign in',
  brandColor: '#1b73e8',
};

export const durationInFrames = 120;
export const fps = 30;
export const width = 1920;
export const height = 1080;

export const Composition: React.FC<ChapterCardProps> = ({
  chapterNumber,
  chapterTitle,
  chapterSubtitle,
  brandColor,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 105, 120], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const numberLift = interpolate(frame, [0, 30], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0b0d10',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        opacity,
      }}
    >
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '0 160px',
        }}
      >
        <div
          style={{
            fontSize: 320,
            fontWeight: 700,
            color: brandColor,
            lineHeight: 1,
            transform: `translateY(${numberLift}px)`,
          }}
        >
          {chapterNumber.toString().padStart(2, '0')}
        </div>
        <div style={{ fontSize: 96, fontWeight: 600, marginTop: 20 }}>{chapterTitle}</div>
        {chapterSubtitle ? (
          <div style={{ fontSize: 36, marginTop: 16, opacity: 0.7 }}>{chapterSubtitle}</div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
