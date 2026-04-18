import { useCallback, useEffect, useMemo, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { CostPreview } from '@renderer/components/CostPreview.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import { KeyEntryDialog } from '@renderer/components/KeyEntryDialog.js';
import type {
  CostPreview as CostPreviewShape,
  StockAvatar,
  StockVoice,
} from '@shared/ipc-types.js';
import type { Script } from '@shared/schemas/script.js';
import type { GenerationMode } from '@shared/schemas/render.js';

// Generate screen per FR-030..FR-035. Four-column pickers, inline cost
// preview, Run + approve. Missing credentials for a paid service trigger a
// KeyEntryDialog before Run becomes usable.

interface Props {
  projectSlug: string;
}

export function Generate({ projectSlug }: Props): JSX.Element {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [voices, setVoices] = useState<StockVoice[]>([]);
  const [avatars, setAvatars] = useState<StockAvatar[]>([]);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [mode, setMode] = useState<GenerationMode>('standard');
  const [preview, setPreview] = useState<CostPreviewShape | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [credNeeded, setCredNeeded] = useState<'elevenlabs' | 'heygen' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);

  const canRun = useMemo(
    () => scriptId !== null && voiceId !== null && avatarId !== null && !running,
    [scriptId, voiceId, avatarId, running],
  );

  const loadEverything = useCallback(async (): Promise<void> => {
    setError(null);
    const status = await unwrap(lumo.credentials.status());
    if (!status.elevenlabs) {
      setCredNeeded('elevenlabs');
      return;
    }
    if (!status.heygen) {
      setCredNeeded('heygen');
      return;
    }
    setCredNeeded(null);
    const [scriptList, stockVoiceList, trainedVoices, stockAvatarList, trainedAvatars] =
      await Promise.all([
        unwrap(lumo.scripts.list({ slug: projectSlug })),
        unwrap(lumo.voices.listStock()).catch(() => [] as StockVoice[]),
        unwrap(lumo.voices.list({ slug: projectSlug })).catch(() => []),
        unwrap(lumo.avatars.listStock()).catch(() => [] as StockAvatar[]),
        unwrap(lumo.avatars.list({ slug: projectSlug })).catch(() => []),
      ]);
    setScripts(scriptList);
    // Trained voices (status='ready' with a providerVoiceId) first, then
    // stock — operators always see their custom work at the top.
    const trainedVoiceOptions: StockVoice[] = trainedVoices
      .filter((v) => v.status === 'ready' && v.providerVoiceId !== null)
      .map((v) => ({
        voiceId: v.providerVoiceId as string,
        name: `${v.name} (trained, ${v.tier.toUpperCase()})`,
        preview: null,
      }));
    setVoices([...trainedVoiceOptions, ...stockVoiceList]);
    const trainedAvatarOptions: StockAvatar[] = trainedAvatars
      .filter((a) => a.status === 'ready' && a.providerAvatarId !== null)
      .map((a) => ({
        avatarId: a.providerAvatarId as string,
        name: `Trained ${a.tier === 'photo' ? 'Photo' : 'Instant'} #${a.id}`,
        tier: a.tier,
      }));
    setAvatars([...trainedAvatarOptions, ...stockAvatarList]);
  }, [projectSlug]);

  useEffect(() => {
    void loadEverything();
  }, [loadEverything]);

  useEffect(() => {
    if (scriptId === null) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    void unwrap(lumo.generate.costPreview({ slug: projectSlug, scriptId, mode }))
      .then((p) => setPreview(p))
      .catch((err) => setError((err as Error).message))
      .finally(() => setPreviewing(false));
  }, [projectSlug, scriptId, mode]);

  async function run(): Promise<void> {
    if (scriptId === null || voiceId === null || avatarId === null) return;
    setRunning(true);
    setError(null);
    try {
      const res = await unwrap(
        lumo.generate.run({
          slug: projectSlug,
          scriptId,
          voiceId,
          voiceRowId: null,
          avatarId,
          avatarRowId: null,
          mode,
        }),
      );
      setJobId(res.jobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (credNeeded !== null) {
    return (
      <KeyEntryDialog
        provider={credNeeded}
        onSaved={() => {
          setCredNeeded(null);
          void loadEverything();
        }}
        onCancel={() => setCredNeeded(null)}
      />
    );
  }

  return (
    <main className="lumo-generate">
      <header>
        <h1>Generate avatar video</h1>
        <p className="lumo-muted">
          Pick a script, a stock voice, a stock avatar, and a mode. You&#39;ll see the cost before
          anything paid runs.
        </p>
      </header>

      <section className="lumo-grid lumo-grid--4">
        <Picker
          label="Script"
          value={scriptId?.toString() ?? ''}
          options={scripts.map((s) => ({
            value: s.id.toString(),
            label: `${s.title} (v${s.version})`,
          }))}
          onChange={(v) => setScriptId(v === '' ? null : Number.parseInt(v, 10))}
        />
        <Picker
          label="Voice"
          value={voiceId ?? ''}
          options={voices.map((v) => ({ value: v.voiceId, label: v.name }))}
          onChange={(v) => setVoiceId(v === '' ? null : v)}
        />
        <Picker
          label="Avatar"
          value={avatarId ?? ''}
          options={avatars.map((a) => ({ value: a.avatarId, label: `${a.name} (${a.tier})` }))}
          onChange={(v) => setAvatarId(v === '' ? null : v)}
        />
        <Picker
          label="Mode"
          value={mode}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'avatar_iv', label: 'Avatar IV (premium)' },
          ]}
          onChange={(v) => setMode(v as GenerationMode)}
        />
      </section>

      <CostPreview preview={preview} loading={previewing} />

      {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}

      <section className="lumo-row">
        <button
          type="button"
          onClick={() => void run()}
          disabled={!canRun}
          aria-keyshortcuts="Control+Enter"
        >
          {running ? 'Submitting…' : 'Run'} <kbd>Ctrl+Enter</kbd>
        </button>
        {jobId !== null ? (
          <AsyncFeedback
            kind="typical"
            hint={`Job ${jobId} queued — HeyGen typically returns in 1–5 minutes.`}
          />
        ) : null}
      </section>
    </main>
  );
}

function Picker(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (next: string) => void;
}): JSX.Element {
  return (
    <label className="lumo-picker">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">— select —</option>
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
