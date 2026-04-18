import { useCallback, useEffect, useMemo, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import { RemotionPreview } from '@renderer/components/RemotionPreview.js';
import { PropsJsonEditor } from '@renderer/components/PropsJsonEditor.js';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts.js';
import { REGISTERED_TEMPLATES, findTemplate } from '@renderer/templates/registry.js';

// Composition studio per FR-036..FR-042. Pick a template, describe the
// output in a prompt (or edit props by hand), preview live, render.

interface Props {
  projectSlug: string;
}

type Resolution = '1080p30' | '1080p60' | '4k30';
type Codec = 'h264' | 'h265';
type Preset = 'fast' | 'balanced' | 'quality';

export function Compose({ projectSlug }: Props): JSX.Element {
  const [templateId, setTemplateId] = useState<string>(REGISTERED_TEMPLATES[0]?.id ?? 'LogoIntro');
  const [props_, setProps] = useState<Record<string, unknown>>(
    () => REGISTERED_TEMPLATES[0]?.defaultProps ?? {},
  );
  const [userPrompt, setUserPrompt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState<{ initial: unknown; message: string | null } | null>(
    null,
  );
  const [jobId, setJobId] = useState<number | null>(null);
  const [title, setTitle] = useState('Untitled composition');

  const [resolution, setResolution] = useState<Resolution>('1080p30');
  const [codec, setCodec] = useState<Codec>('h264');
  const [preset, setPreset] = useState<Preset>('balanced');
  const [audioBitrate, setAudioBitrate] = useState('192k');

  const template = useMemo(() => findTemplate(templateId), [templateId]);

  const resetProps = useCallback((id: string): void => {
    const t = findTemplate(id);
    if (t) setProps({ ...t.defaultProps });
  }, []);

  useEffect(() => {
    resetProps(templateId);
  }, [templateId, resetProps]);

  async function applyPrompt(): Promise<void> {
    if (userPrompt.trim().length === 0) return;
    setBusy('Claude is filling the template…');
    setError(null);
    try {
      const result = await unwrap(
        lumo.compose.promptProps({ templateId, userPrompt, startingProps: props_ }),
      );
      if (result.kind === 'ok') {
        setProps(result.props as Record<string, unknown>);
        return;
      }
      // Both attempts failed schema validation — open the JSON editor
      // pre-populated with the last raw response for manual correction.
      let initial: unknown = props_;
      try {
        initial = JSON.parse(result.lastRawResponse);
      } catch {
        initial = props_;
      }
      setEditorOpen({ initial, message: result.validationError });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function render(): Promise<void> {
    if (template === null) return;
    setBusy('Submitting render…');
    setError(null);
    try {
      const res = await unwrap(
        lumo.compose.render({
          slug: projectSlug,
          templateId,
          props: props_,
          settings: { resolution, codec, preset, audioBitrate },
          scriptId: null,
          title: title.trim() || 'Untitled composition',
        }),
      );
      setJobId(res.jobId);
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
        if (template !== null && busy === null) void render();
      },
    },
  ]);

  if (template === null) {
    return (
      <main className="lumo-compose">
        <p>No template selected.</p>
      </main>
    );
  }

  const duration =
    typeof template.durationInFrames === 'function'
      ? template.durationInFrames(props_)
      : template.durationInFrames;

  return (
    <main className="lumo-compose">
      <header>
        <h1>Composition studio</h1>
        <p className="lumo-muted">Project: {projectSlug}</p>
      </header>

      <section className="lumo-row">
        <label>
          Template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {REGISTERED_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="lumo-input" />
        </label>
      </section>

      <section className="lumo-compose__prompt">
        <label>
          Prompt (describe the final look)
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={3}
            placeholder='e.g. "Dell blue (#0076CE), title \"Azure Local rack awareness\", subtitle \"Kenny Lowe — Dell TME\"."'
          />
        </label>
        <div className="lumo-row">
          <button
            type="button"
            onClick={() => void applyPrompt()}
            disabled={busy !== null || userPrompt.trim().length === 0}
          >
            Apply prompt
          </button>
          <button
            type="button"
            onClick={() => setEditorOpen({ initial: props_, message: null })}
            disabled={busy !== null}
          >
            Edit props JSON
          </button>
          <button type="button" onClick={() => resetProps(templateId)} disabled={busy !== null}>
            Reset to defaults
          </button>
        </div>
      </section>

      <section className="lumo-compose__preview">
        <RemotionPreview
          component={template.component}
          durationInFrames={duration}
          fps={template.fps}
          width={template.width}
          height={template.height}
          inputProps={props_}
        />
      </section>

      <section className="lumo-compose__render">
        <h2>Render</h2>
        <div className="lumo-row">
          <label>
            Resolution
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
            >
              <option value="1080p30">1080p30</option>
              <option value="1080p60">1080p60</option>
              <option value="4k30">4K30</option>
            </select>
          </label>
          <label>
            Codec
            <select value={codec} onChange={(e) => setCodec(e.target.value as Codec)}>
              <option value="h264">h264</option>
              <option value="h265">h265</option>
            </select>
          </label>
          <label>
            Preset
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="fast">fast</option>
              <option value="balanced">balanced</option>
              <option value="quality">quality</option>
            </select>
          </label>
          <label>
            Audio bitrate
            <input
              value={audioBitrate}
              onChange={(e) => setAudioBitrate(e.target.value)}
              className="lumo-input"
            />
          </label>
          <button
            type="button"
            onClick={() => void render()}
            disabled={busy !== null}
            aria-keyshortcuts="Control+Enter"
          >
            Render <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
        {jobId !== null ? (
          <AsyncFeedback
            kind="typical"
            hint={`Render job ${jobId} queued — typical render is several minutes; first render ever triggers Remotion's Chromium download.`}
          />
        ) : null}
      </section>

      {busy !== null ? <AsyncFeedback kind="typical" hint={busy} /> : null}
      {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}

      {editorOpen !== null ? (
        <PropsJsonEditor
          initialValue={editorOpen.initial}
          errorMessage={editorOpen.message}
          onApply={(next) => {
            setProps(next as Record<string, unknown>);
            setEditorOpen(null);
          }}
          onCancel={() => setEditorOpen(null)}
          onValidate={async (candidate) =>
            unwrap(lumo.compose.validateProps({ templateId, props: candidate }))
          }
        />
      ) : null}
    </main>
  );
}
