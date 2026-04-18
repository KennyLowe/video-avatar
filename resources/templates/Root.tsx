import React from 'react';
import { Composition as RemotionComposition, registerRoot } from 'remotion';
import * as LogoIntro from './LogoIntro.js';
import * as LowerThird from './LowerThird.js';
import * as TitleSlide from './TitleSlide.js';
import * as ChapterCard from './ChapterCard.js';
import * as FullExplainer from './FullExplainer.js';

// The Root component is what @remotion/bundler ingests. Every template is
// registered here with a deterministic composition id so renderMedia can
// target it by name. The loader service keeps its template inventory in
// sync with this registration list via a simple list match.

const RemotionRoot: React.FC = () => (
  <>
    <RemotionComposition
      id={LogoIntro.id}
      component={LogoIntro.Composition}
      durationInFrames={LogoIntro.durationInFrames}
      fps={LogoIntro.fps}
      width={LogoIntro.width}
      height={LogoIntro.height}
      defaultProps={LogoIntro.defaultProps}
      schema={LogoIntro.schema}
    />
    <RemotionComposition
      id={LowerThird.id}
      component={LowerThird.Composition}
      durationInFrames={LowerThird.durationInFrames}
      fps={LowerThird.fps}
      width={LowerThird.width}
      height={LowerThird.height}
      defaultProps={LowerThird.defaultProps}
      schema={LowerThird.schema}
    />
    <RemotionComposition
      id={TitleSlide.id}
      component={TitleSlide.Composition}
      durationInFrames={TitleSlide.durationInFrames}
      fps={TitleSlide.fps}
      width={TitleSlide.width}
      height={TitleSlide.height}
      defaultProps={TitleSlide.defaultProps}
      schema={TitleSlide.schema}
    />
    <RemotionComposition
      id={ChapterCard.id}
      component={ChapterCard.Composition}
      durationInFrames={ChapterCard.durationInFrames}
      fps={ChapterCard.fps}
      width={ChapterCard.width}
      height={ChapterCard.height}
      defaultProps={ChapterCard.defaultProps}
      schema={ChapterCard.schema}
    />
    <RemotionComposition
      id={FullExplainer.id}
      component={FullExplainer.Composition}
      calculateMetadata={({ props }) => ({
        durationInFrames: FullExplainer.durationInFrames(props),
      })}
      durationInFrames={FullExplainer.durationInFrames(FullExplainer.defaultProps)}
      fps={FullExplainer.fps}
      width={FullExplainer.width}
      height={FullExplainer.height}
      defaultProps={FullExplainer.defaultProps}
      schema={FullExplainer.schema}
    />
  </>
);

registerRoot(RemotionRoot);
