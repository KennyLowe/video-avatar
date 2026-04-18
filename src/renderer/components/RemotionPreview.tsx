import { Player } from '@remotion/player';
import type React from 'react';

// Wraps @remotion/player's <Player> with the props / composition / duration
// wiring Lumo's Compose screen needs. The player ingests the component ref
// directly — no bundle step, preview is fully live. Remotion's `inputProps`
// changes cascade into re-render; scrub and play/pause come from the
// component's own controls.

interface Props<T> {
  component: React.ComponentType<T>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  inputProps: T;
}

export function RemotionPreview<T extends Record<string, unknown>>(props: Props<T>): JSX.Element {
  return (
    <div className="lumo-remotion-preview">
      <Player
        component={props.component}
        durationInFrames={props.durationInFrames}
        fps={props.fps}
        compositionWidth={props.width}
        compositionHeight={props.height}
        inputProps={props.inputProps}
        controls
        clickToPlay
        style={{
          width: '100%',
          aspectRatio: `${props.width} / ${props.height}`,
          backgroundColor: '#000',
        }}
      />
    </div>
  );
}
