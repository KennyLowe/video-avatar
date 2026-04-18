// Renderer-side template registry. Binds template ids to their component +
// metadata so the Compose screen's live preview (@remotion/player) can
// resolve a composition by id without going through the bundler.
//
// Adding a new bundled template means adding an entry here AND in
// resources/templates/Root.tsx (which is what @remotion/bundler ingests).

import type { ComponentType } from 'react';
import * as LogoIntro from '@templates/LogoIntro';
import * as LowerThird from '@templates/LowerThird';
import * as TitleSlide from '@templates/TitleSlide';
import * as ChapterCard from '@templates/ChapterCard';
import * as FullExplainer from '@templates/FullExplainer';

export interface RegisteredTemplate {
  id: string;
  displayName: string;
  description: string;
  component: ComponentType<Record<string, unknown>>;
  durationInFrames: number | ((props: Record<string, unknown>) => number);
  fps: number;
  width: number;
  height: number;
  defaultProps: Record<string, unknown>;
}

function register<T extends Record<string, unknown>>(mod: {
  id: string;
  displayName: string;
  description: string;
  Composition: ComponentType<T>;
  durationInFrames: number | ((props: T) => number);
  fps: number;
  width: number;
  height: number;
  defaultProps: T;
}): RegisteredTemplate {
  return {
    id: mod.id,
    displayName: mod.displayName,
    description: mod.description,
    component: mod.Composition as ComponentType<Record<string, unknown>>,
    durationInFrames: mod.durationInFrames as RegisteredTemplate['durationInFrames'],
    fps: mod.fps,
    width: mod.width,
    height: mod.height,
    defaultProps: mod.defaultProps as Record<string, unknown>,
  };
}

export const REGISTERED_TEMPLATES: readonly RegisteredTemplate[] = [
  register(LogoIntro),
  register(LowerThird),
  register(TitleSlide),
  register(ChapterCard),
  register(FullExplainer),
];

export function findTemplate(id: string): RegisteredTemplate | null {
  return REGISTERED_TEMPLATES.find((t) => t.id === id) ?? null;
}
