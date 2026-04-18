import { useCallback, useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import { FaceDetectPanel } from '@renderer/components/FaceDetectPanel.js';
import { usePrompt } from '@renderer/components/PromptProvider.js';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts.js';
import {
  evaluateImage,
  evaluateVideo,
  hasRejection,
  type HeuristicFinding,
} from '@renderer/services/qualityHeuristics.js';
import type { ImageProbePayload, VideoProbePayload } from '@shared/ipc-types.js';
import type { Avatar } from '@shared/schemas/avatar.js';
import type { Segment } from '@shared/schemas/segment.js';

// Avatar lab per FR-023..FR-029. Tier selector drives the importer: Photo
// Avatar takes an image and a single Train submission; Instant Avatar takes
// a source video, operator marks 1–N clean segments, then trains from the
// concatenated set.

interface Props {
  projectSlug: string;
}

type Tier = 'photo' | 'instant';

export function Avatar({ projectSlug }: Props): JSX.Element {
  const [tier, setTier] = useState<Tier>('photo');
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [imageImport, setImageImport] = useState<{
    path: string;
    probe: ImageProbePayload;
  } | null>(null);
  const [videoImport, setVideoImport] = useState<{
    path: string;
    probe: VideoProbePayload;
  } | null>(null);
  const [findings, setFindings] = useState<HeuristicFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segmentInSeconds, setSegmentInSeconds] = useState(0);
  const [segmentOutSeconds, setSegmentOutSeconds] = useState(0);
  const prompt = usePrompt();

  const refresh = useCallback(async (): Promise<void> => {
    const [avatarList, segmentList] = await Promise.all([
      unwrap(lumo.avatars.list({ slug: projectSlug })),
      unwrap(lumo.avatars.listSegments({ slug: projectSlug })),
    ]);
    setAvatars(avatarList);
    setSegments(segmentList);
  }, [projectSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function pickFile(accept: string): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = (): void => {
        const file = input.files?.[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (file as any)?.path as string | undefined;
        resolve(p ?? null);
      };
      input.oncancel = (): void => resolve(null);
      input.click();
    });
  }

  async function importImage(): Promise<void> {
    const sourcePath = await pickFile('.png,.jpg,.jpeg,.webp,image/*');
    if (sourcePath === null) return;
    setBusy('Importing image…');
    setError(null);
    try {
      const res = await unwrap(lumo.avatars.importImage({ slug: projectSlug, sourcePath }));
      setImageImport(res);
      // Run heuristics. We use a best-effort estimate for the face count /
      // sharpness via the renderer's face-api adapter; if it's not available,
      // the adapter returns conservative defaults and evaluateImage warns
      // only on resolution.
      const img = await loadImage(res.path);
      const faceDetect = await import('@renderer/services/faceDetect.js');
      const detection = await faceDetect.detectImage(img);
      const result = evaluateImage({
        shortEdgePx: Math.min(res.probe.widthPx, res.probe.heightPx),
        faceCount: detection.faceCount,
        laplacianVariance: detection.laplacianVariance,
      });
      setFindings(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function importVideo(): Promise<void> {
    const sourcePath = await pickFile('.mp4,.mov,.webm,video/*');
    if (sourcePath === null) return;
    setBusy('Importing video…');
    setError(null);
    try {
      const res = await unwrap(lumo.avatars.importVideo({ slug: projectSlug, sourcePath }));
      setVideoImport(res);
      setSegmentInSeconds(0);
      setSegmentOutSeconds(Math.min(res.probe.durationSeconds, 30));
      // Lightweight-but-real heuristics: sample a handful of frames via
      // <video> element, pass through face-detect. For MVP we don't draw
      // the scrubber; segment in/out is number inputs and the operator
      // gets warnings post-import.
      const frames = await sampleVideoFrames(res.path, 8);
      const faceDetect = await import('@renderer/services/faceDetect.js');
      const samples = await faceDetect.detectVideoFrames(frames);
      const meanDelta = faceDetect.meanInterFrameDelta(frames);
      const result = evaluateVideo({
        shortEdgePx: Math.min(res.probe.widthPx, res.probe.heightPx),
        frameSamples: samples,
        meanInterFrameDelta: meanDelta,
      });
      setFindings(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addSegment(): Promise<void> {
    if (videoImport === null) return;
    if (segmentOutSeconds <= segmentInSeconds) {
      setError('Segment end must be after segment start.');
      return;
    }
    setBusy('Extracting segment…');
    setError(null);
    try {
      await unwrap(
        lumo.avatars.addSegment({
          slug: projectSlug,
          sourcePath: videoImport.path,
          inMs: Math.round(segmentInSeconds * 1000),
          outMs: Math.round(segmentOutSeconds * 1000),
        }),
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function trainPhoto(): Promise<void> {
    if (imageImport === null) return;
    if (hasRejection(findings)) {
      setError('Cannot submit: quality checks reject this image.');
      return;
    }
    const name = await prompt('Name for this Photo Avatar');
    if (name === null || name.trim().length === 0) return;
    setBusy('Submitting Photo Avatar…');
    setError(null);
    try {
      await unwrap(
        lumo.avatars.trainPhoto({
          slug: projectSlug,
          imagePath: imageImport.path,
          name: name.trim(),
        }),
      );
      setImageImport(null);
      setFindings([]);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function trainInstant(): Promise<void> {
    if (segments.length === 0) {
      setError('Add at least one segment before training.');
      return;
    }
    const name = await prompt('Name for this Instant Avatar');
    if (name === null || name.trim().length === 0) return;
    setBusy('Submitting Instant Avatar…');
    setError(null);
    try {
      await unwrap(
        lumo.avatars.trainInstant({
          slug: projectSlug,
          segmentIds: segments.map((s) => s.id),
          name: name.trim(),
        }),
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useKeyboardShortcuts([
    {
      combo: 'mod+enter',
      handler: () => {
        if (busy !== null) return;
        if (tier === 'photo' && imageImport !== null && !hasRejection(findings)) {
          void trainPhoto();
        } else if (tier === 'instant' && segments.length > 0) {
          void trainInstant();
        }
      },
    },
  ]);

  return (
    <main className="lumo-avatar">
      <header>
        <h1>Avatar lab</h1>
        <p className="lumo-muted">Project: {projectSlug}</p>
      </header>

      <section className="lumo-row">
        <label>
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            <option value="photo">Photo Avatar (one portrait)</option>
            <option value="instant">Instant Avatar (2–5 min video)</option>
          </select>
        </label>
      </section>

      {tier === 'photo' ? (
        <section className="lumo-avatar__photo">
          <h2>Import portrait</h2>
          <button type="button" onClick={() => void importImage()} disabled={busy !== null}>
            Choose image…
          </button>
          {imageImport !== null ? (
            <>
              <p className="lumo-muted">
                {imageImport.path} — {imageImport.probe.widthPx}×{imageImport.probe.heightPx}
              </p>
              <FaceDetectPanel findings={findings} />
              <button
                type="button"
                onClick={() => void trainPhoto()}
                disabled={busy !== null || hasRejection(findings)}
                aria-keyshortcuts="Control+Enter"
              >
                Train Photo Avatar <kbd>Ctrl+Enter</kbd>
              </button>
            </>
          ) : null}
        </section>
      ) : (
        <section className="lumo-avatar__instant">
          <h2>Import video</h2>
          <button type="button" onClick={() => void importVideo()} disabled={busy !== null}>
            Choose video…
          </button>
          {videoImport !== null ? (
            <>
              <p className="lumo-muted">
                {videoImport.path} — {videoImport.probe.widthPx}×{videoImport.probe.heightPx} ·{' '}
                {videoImport.probe.durationSeconds.toFixed(1)}s · {videoImport.probe.codec}
              </p>
              <FaceDetectPanel findings={findings} />
              <div className="lumo-row">
                <label>
                  Segment in (s)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={segmentInSeconds}
                    onChange={(e) => setSegmentInSeconds(Number.parseFloat(e.target.value))}
                  />
                </label>
                <label>
                  Segment out (s)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={segmentOutSeconds}
                    onChange={(e) => setSegmentOutSeconds(Number.parseFloat(e.target.value))}
                  />
                </label>
                <button type="button" onClick={() => void addSegment()} disabled={busy !== null}>
                  Add segment
                </button>
              </div>
            </>
          ) : null}

          {segments.length > 0 ? (
            <>
              <h3>Segments</h3>
              <ul className="lumo-segments">
                {segments.map((s) => (
                  <li key={s.id}>
                    {(s.inMs / 1000).toFixed(1)}s → {(s.outMs / 1000).toFixed(1)}s
                    <span className="lumo-muted"> ({((s.outMs - s.inMs) / 1000).toFixed(1)}s)</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void trainInstant()}
                disabled={busy !== null || segments.length === 0}
                aria-keyshortcuts="Control+Enter"
              >
                Train Instant Avatar <kbd>Ctrl+Enter</kbd>
              </button>
            </>
          ) : null}
        </section>
      )}

      {busy !== null ? <AsyncFeedback kind="typical" hint={busy} /> : null}
      {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}

      <section>
        <h2>Trained avatars</h2>
        {avatars.length === 0 ? (
          <p className="lumo-muted">No trained avatars yet.</p>
        ) : (
          <ul className="lumo-avatars">
            {avatars.map((a) => (
              <li key={a.id} className={`lumo-avatar-row lumo-avatar-row--${a.status}`}>
                <strong>{a.tier === 'photo' ? 'Photo Avatar' : 'Instant Avatar'}</strong>
                <span className="lumo-muted">
                  {a.status}
                  {a.providerAvatarId !== null ? ` · ${a.providerAvatarId}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// --- helpers -------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = fileUrl(src);
  });
}

async function sampleVideoFrames(src: string, count: number): Promise<HTMLImageElement[]> {
  // Load the video as a <video> element and capture frames with canvas at
  // evenly-spaced timestamps. Expensive but runs once per import.
  const video = document.createElement('video');
  video.src = fileUrl(src);
  video.muted = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load video: ${src}`));
  });
  const duration = video.duration;
  const frames: HTMLImageElement[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = Math.round(320 * (video.videoHeight / Math.max(1, video.videoWidth)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return frames;
  for (let i = 0; i < count; i += 1) {
    const t = (duration / (count + 1)) * (i + 1);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('seek failed'));
      video.currentTime = t;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });
    frames.push(img);
  }
  return frames;
}

function fileUrl(absPath: string): string {
  return `file:///${absPath.replace(/\\/g, '/')}`;
}
