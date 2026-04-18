import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { z } from 'zod';

// Name + title overlay. Slides in from the left, holds for most of the
// duration, slides out. Designed to layer over an avatar clip; pure
// overlay — background is transparent where the card doesn't paint.

export const id = 'LowerThird';
export const displayName = 'Lower third';
export const description = 'Name + title overlay with slide in/out.';

export const schema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'brandColor must be a 7-char hex literal'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'accentColor must be a 7-char hex literal')
    .optional(),
});
export type LowerThirdProps = z.infer<typeof schema>;

export const defaultProps: LowerThirdProps = {
  name: 'Kenny Lowe',
  title: 'Technical marketing engineer',
  brandColor: '#1b73e8',
  accentColor: '#ffffff',
};

export const durationInFrames = 150; // 5 s at 30 fps
export const fps = 30;
export const width = 1920;
export const height = 1080;

export const Composition: React.FC<LowerThirdProps> = ({
  name,
  title,
  brandColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [0, 20, 130, 150], [-600, 0, 0, -600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <div
        style={{
          position: 'absolute',
          bottom: 160,
          left: 120,
          backgroundColor: brandColor,
          color: accentColor ?? '#ffffff',
          padding: '20px 40px 20px 32px',
          borderLeft: `6px solid ${accentColor ?? '#ffffff'}`,
          transform: `translateX(${slide}px)`,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 600 }}>{name}</div>
        {title ? <div style={{ fontSize: 28, marginTop: 4, opacity: 0.9 }}>{title}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
