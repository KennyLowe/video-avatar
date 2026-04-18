import { useEffect, useRef } from 'react';
import type { RecorderSnapshot } from '@renderer/services/audioRecorder.js';

// Live RMS/peak meter + scrolling waveform. One canvas, one useEffect that
// attaches to a subscribe function on the AudioRecorder and draws on each
// snapshot. No React state per frame — keeps us below one re-render per
// second regardless of sample rate.

interface Props {
  /** Register a snapshot listener; call the returned function to unsubscribe. */
  subscribe: (fn: (snap: RecorderSnapshot) => void) => () => void;
  height?: number;
}

const WAVEFORM_HISTORY_COLS = 240;

export function WaveformMeter({ subscribe, height = 80 }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<Float32Array>(new Float32Array(WAVEFORM_HISTORY_COLS));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const draw = (snap: RecorderSnapshot): void => {
      // Push a new column with the current peak into the history ring.
      const history = historyRef.current;
      history.copyWithin(0, 1);
      history[history.length - 1] = snap.peak;

      const { width, height: h } = canvas;
      ctx.clearRect(0, 0, width, h);

      // Waveform bars — one bar per column, height scaled by recent peaks.
      const barWidth = width / history.length;
      ctx.fillStyle = '#4a9df7';
      for (let i = 0; i < history.length; i += 1) {
        const v = history[i] ?? 0;
        const barHeight = Math.max(1, v * (h * 0.9));
        ctx.fillRect(i * barWidth, (h - barHeight) / 2, Math.max(1, barWidth - 1), barHeight);
      }

      // Peak marker — thin line over the latest column.
      ctx.fillStyle = snap.peak > 0.98 ? '#f97171' : '#e9ecef';
      ctx.fillRect(width - 2, 0, 2, h);

      // RMS line — thin horizontal gradient band at the RMS level across the
      // canvas, to distinguish peak-only signal from steady signal.
      const rmsY = h / 2 - snap.rms * (h * 0.45);
      const rmsY2 = h / 2 + snap.rms * (h * 0.45);
      ctx.fillStyle = 'rgba(233, 236, 239, 0.1)';
      ctx.fillRect(0, rmsY, width, rmsY2 - rmsY);
    };

    const unsubscribe = subscribe(draw);
    return () => unsubscribe();
  }, [subscribe]);

  return (
    <canvas
      ref={canvasRef}
      className="lumo-waveform"
      width={480}
      height={height}
      aria-label="Audio level meter and scrolling waveform"
    />
  );
}
