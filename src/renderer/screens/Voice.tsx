import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import {
  AudioRecorder,
  enumerateInputDevices,
  type AudioDevice,
  type RecorderSnapshot,
} from '@renderer/services/audioRecorder.js';
import { WaveformMeter } from '@renderer/components/WaveformMeter.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import { usePrompt, useConfirm } from '@renderer/components/PromptProvider.js';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts.js';
import type { Take } from '@shared/schemas/take.js';
import type { Voice, VoiceTier } from '@shared/schemas/voice.js';

// Voice lab per FR-015..FR-022. Record or import audio, mark good/bad, trim
// via in/out (inline, not a separate editor), see cumulative good minutes,
// submit for PVC or IVC, preview the trained voice.

interface Props {
  projectSlug: string;
}

type Listener = (snap: RecorderSnapshot) => void;

export function Voice({ projectSlug }: Props): JSX.Element {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [goodSeconds, setGoodSeconds] = useState(0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [minimums, setMinimums] = useState<{ pvcSeconds: number; ivcSeconds: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const prompt = usePrompt();
  const confirm = useConfirm();

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const [takeInfo, voiceList] = await Promise.all([
      unwrap(lumo.voices.listTakes({ slug: projectSlug })),
      unwrap(lumo.voices.list({ slug: projectSlug })),
    ]);
    setTakes(takeInfo.takes);
    setGoodSeconds(takeInfo.goodSeconds);
    setVoices(voiceList);
  }, [projectSlug]);

  useEffect(() => {
    void (async () => {
      try {
        const [deviceList, mins] = await Promise.all([
          enumerateInputDevices(),
          unwrap(lumo.voices.minimums()),
        ]);
        setDevices(deviceList);
        setDeviceId(deviceList[0]?.deviceId ?? null);
        setMinimums(mins);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [refresh]);

  async function startRecording(): Promise<void> {
    if (deviceId === null) return;
    setError(null);
    const recorder = new AudioRecorder({
      deviceId,
      onSnapshot: (snap) => {
        for (const l of listenersRef.current) l(snap);
      },
    });
    try {
      await recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function stopRecording(): Promise<void> {
    const recorder = recorderRef.current;
    if (recorder === null) return;
    setBusy('Saving take…');
    try {
      const result = await recorder.stop();
      recorderRef.current = null;
      setRecording(false);
      setPaused(false);
      await unwrap(
        lumo.voices.saveRecording({
          slug: projectSlug,
          bytesBase64: result.bytesBase64,
          sourceExtension: result.sourceExtension,
        }),
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function togglePause(): void {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (paused) {
      recorder.resume();
      setPaused(false);
    } else {
      recorder.pause();
      setPaused(true);
    }
  }

  async function importAudio(): Promise<void> {
    // Electron's <input type="file"> surfaces the full path via .path on the
    // File object (we disable webSecurity... no actually we don't; use the
    // native showOpenDialog via IPC in a real implementation). For MVP
    // renderer-side file access we rely on the path exposed by Electron's
    // file input; if that's not reachable, switch to ipcRenderer.invoke to
    // a settings.pickOpenFile helper. Phase 4 takes the simpler path.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wav,.mp3,.flac,.m4a,.ogg,audio/*';
    input.onchange = async (): Promise<void> => {
      const file = input.files?.[0];
      if (!file) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourcePath = (file as any).path as string | undefined;
      if (!sourcePath) {
        setError('Electron did not surface an absolute path for the selected file.');
        return;
      }
      setBusy(`Importing ${file.name}…`);
      try {
        await unwrap(lumo.voices.importFile({ slug: projectSlug, sourcePath }));
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    };
    input.click();
  }

  async function mark(takeId: number, nextMark: 'good' | 'bad' | 'unmarked'): Promise<void> {
    try {
      await unwrap(lumo.voices.markTake({ slug: projectSlug, takeId, mark: nextMark }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteTake(takeId: number): Promise<void> {
    if (!(await confirm('Delete this take? This cannot be undone.'))) return;
    try {
      await unwrap(lumo.voices.deleteTake({ slug: projectSlug, takeId }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function train(tier: VoiceTier): Promise<void> {
    const name = await prompt(`Name for this ${tier.toUpperCase()} voice`);
    if (name === null || name.trim().length === 0) return;
    setBusy(`Submitting ${tier.toUpperCase()}…`);
    try {
      await unwrap(lumo.voices.train({ slug: projectSlug, name: name.trim(), tier }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const minutes = Math.floor(goodSeconds / 60);
  const seconds = Math.floor(goodSeconds % 60);
  const pvcBlocked = minimums !== null && goodSeconds < minimums.pvcSeconds;
  const ivcBlocked = minimums !== null && goodSeconds < minimums.ivcSeconds;

  useKeyboardShortcuts([
    {
      combo: 'mod+enter',
      handler: () => {
        if (!pvcBlocked && busy === null) void train('pvc');
      },
    },
  ]);
  const pvcGap = useMemo(() => {
    if (!minimums) return '';
    const gap = Math.max(0, minimums.pvcSeconds - goodSeconds);
    return gap === 0 ? '' : ` — ${Math.ceil(gap / 60)} min short`;
  }, [goodSeconds, minimums]);

  return (
    <main className="lumo-voice">
      <header>
        <h1>Voice lab</h1>
        <p className="lumo-muted">Project: {projectSlug}</p>
      </header>

      <section className="lumo-voice__record">
        <h2>Record</h2>
        <div className="lumo-row">
          <label>
            Microphone
            <select
              value={deviceId ?? ''}
              onChange={(e) => setDeviceId(e.target.value === '' ? null : e.target.value)}
              disabled={recording}
            >
              <option value="">— select —</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {!recording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={deviceId === null || busy !== null}
            >
              Record
            </button>
          ) : (
            <>
              <button type="button" onClick={togglePause}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={() => void stopRecording()} disabled={busy !== null}>
                Stop
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void importAudio()}
            disabled={busy !== null || recording}
          >
            Import audio…
          </button>
        </div>
        {recording ? <WaveformMeter subscribe={subscribe} /> : null}
        {busy !== null ? <AsyncFeedback kind="typical" hint={busy} /> : null}
        {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}
      </section>

      <section className="lumo-voice__takes">
        <h2>
          Takes — {minutes}m {seconds.toString().padStart(2, '0')}s good
        </h2>
        {takes.length === 0 ? (
          <p className="lumo-muted">No takes yet. Record or import above.</p>
        ) : (
          <ul className="lumo-takes">
            {takes.map((t) => (
              <li key={t.id} className={`lumo-take lumo-take--${t.mark}`}>
                <span className="lumo-take__dur">
                  {Math.floor(t.durationSeconds / 60)}:
                  {Math.floor(t.durationSeconds % 60)
                    .toString()
                    .padStart(2, '0')}
                </span>
                <span className="lumo-take__src">{t.source}</span>
                <div className="lumo-take__actions">
                  <button
                    type="button"
                    onClick={() => void mark(t.id, t.mark === 'good' ? 'unmarked' : 'good')}
                  >
                    {t.mark === 'good' ? 'Unmark good' : 'Mark good'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void mark(t.id, t.mark === 'bad' ? 'unmarked' : 'bad')}
                  >
                    {t.mark === 'bad' ? 'Unmark bad' : 'Mark bad'}
                  </button>
                  <button type="button" onClick={() => void deleteTake(t.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lumo-voice__train">
        <h2>Train voice</h2>
        <div className="lumo-row">
          <button
            type="button"
            onClick={() => void train('pvc')}
            disabled={pvcBlocked || busy !== null}
            aria-keyshortcuts="Control+Enter"
          >
            Train Professional Voice Clone (PVC){pvcGap} <kbd>Ctrl+Enter</kbd>
          </button>
          <button
            type="button"
            onClick={() => void train('ivc')}
            disabled={ivcBlocked || busy !== null}
            title="Quick test only — not recommended for production"
          >
            Quick test with IVC (not recommended for production)
          </button>
        </div>
      </section>

      <section className="lumo-voice__voices">
        <h2>Voices</h2>
        {voices.length === 0 ? (
          <p className="lumo-muted">No trained voices yet.</p>
        ) : (
          <ul className="lumo-voices">
            {voices.map((v) => (
              <li key={v.id} className={`lumo-voice-row lumo-voice-row--${v.status}`}>
                <strong>{v.name}</strong>
                <span className="lumo-muted">
                  {v.tier.toUpperCase()} · {v.status}
                  {v.sampleSeconds > 0 ? ` · ${Math.round(v.sampleSeconds / 60)} min trained` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
