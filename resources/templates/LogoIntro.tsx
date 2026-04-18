import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Img } from 'remotion';
import { z } from 'zod';

// 4-second logo-plus-title intro card. Brand colour wash, optional logo,
// title and optional subtitle. Fade-in (frames 0..15) / fade-out
// (frames 105..120).

export const id = 'LogoIntro';
export const displayName = 'Logo intro';
export const description = '4-second logo + title + subtitle on a brand-colour wash.';

export const schema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'brandColor must be a 7-char hex literal'),
  logoUrl: z.string().optional(),
});
export type LogoIntroProps = z.infer<typeof schema>;

export const defaultProps: LogoIntroProps = {
  title: 'Lumo',
  subtitle: 'your video, your voice',
  brandColor: '#1b73e8',
};

export const durationInFrames = 120;
export const fps = 30;
export const width = 1920;
export const height = 1080;

export const Composition: React.FC<LogoIntroProps> = ({ title, subtitle, brandColor, logoUrl }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 105, 120], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lift = interpolate(frame, [0, 30], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: brandColor,
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        opacity,
      }}
    >
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            width: 280,
            height: 280,
            objectFit: 'contain',
            marginBottom: 36,
            transform: `translateY(${lift}px)`,
          }}
        />
      ) : null}
      <div style={{ fontSize: 128, fontWeight: 600, transform: `translateY(${lift}px)` }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 48, marginTop: 24, opacity: 0.85 }}>{subtitle}</div>
      ) : null}
    </AbsoluteFill>
  );
};
