import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { lint } from '@renderer/services/spokenLinter.js';
import { AssistMenu } from '@renderer/components/AssistMenu.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import type { ScriptTone } from '@shared/ipc-types.js';

// Script studio per FR-010..FR-014. Prompt + tone + target length, generate
// via Claude Code, edit in Monaco with the spoken-word linter, run assist
// actions on selection, save as immutable versions.

interface Props {
  projectSlug: string;
  onSaved?: (scriptId: number) => void;
}

const TARGET_LENGTH_OPTIONS: readonly { label: string; seconds: number }[] = [
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute', seconds: 60 },
  { label: '2 minutes', seconds: 120 },
  { label: '3 minutes', seconds: 180 },
  { label: '5 minutes', seconds: 300 },
];

const DEFAULT_WPM = 150;

export function Script({ projectSlug, onSaved }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState<ScriptTone>('conversational');
  const [targetSeconds, setTargetSeconds] = useState(60);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [selection, setSelection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const stats = useMemo(() => computeStats(body), [body]);

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (!model || !sel) return;
      setSelection(model.getValueInRange(sel));
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const marks = lint(body);
    const decorations = marks.map((m) => ({
      range: new monaco.Range(m.line, m.column, m.line, m.column + m.length),
      options: {
        inlineClassName: `lumo-lint lumo-lint--${m.ruleId}`,
        hoverMessage: { value: m.message },
        minimap: { color: '#f59e0b', position: 1 },
      },
    }));
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  }, [body]);

  async function generate(): Promise<void> {
    if (prompt.trim().length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await unwrap(
        lumo.scripts.generate({ prompt, tone, targetDurationSeconds: targetSeconds }),
      );
      setTitle(res.title);
      setBody(res.body);
      setEstimatedSeconds(res.estimatedDurationSeconds);
      setSavedId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function save(): Promise<void> {
    if (title.trim().length === 0 || body.trim().length === 0) return;
    setSaving(true);
    try {
      const script = await unwrap(
        lumo.scripts.save({
          slug: projectSlug,
          id: savedId,
          title,
          bodyMd: body,
          estimatedSeconds: estimatedSeconds > 0 ? estimatedSeconds : Math.ceil(stats.seconds),
        }),
      );
      setSavedId(script.id);
      onSaved?.(script.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="lumo-script">
      <header>
        <h1>Script studio</h1>
        <p className="lumo-muted">Project: {projectSlug}</p>
      </header>

      <section className="lumo-script__prompt">
        <label>
          Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe what the script should cover."
          />
        </label>
        <div className="lumo-row">
          <label>
            Tone
            <select value={tone} onChange={(e) => setTone(e.target.value as ScriptTone)}>
              <option value="conversational">Conversational</option>
              <option value="technical">Technical</option>
              <option value="formal">Formal</option>
            </select>
          </label>
          <label>
            Target length
            <select
              value={targetSeconds}
              onChange={(e) => setTargetSeconds(Number.parseInt(e.target.value, 10))}
            >
              {TARGET_LENGTH_OPTIONS.map((opt) => (
                <option key={opt.seconds} value={opt.seconds}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || prompt.trim().length === 0}
            aria-keyshortcuts="Control+Enter"
          >
            {generating ? 'Generating…' : 'Generate script'} <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
        {generating ? (
          <AsyncFeedback kind="typical" hint="Claude is drafting the script — typically 5–15 s." />
        ) : null}
        {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}
      </section>

      <section className="lumo-script__editor">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="lumo-input" />
        </label>
        <Editor
          height="420px"
          defaultLanguage="markdown"
          theme="vs-dark"
          value={body}
          onChange={(v) => setBody(v ?? '')}
          onMount={onEditorMount}
          options={{
            wordWrap: 'on',
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
          }}
        />
        <div className="lumo-script__stats" aria-live="polite">
          {stats.words} words · {stats.characters} characters · ~{formatSeconds(stats.seconds)} at{' '}
          {DEFAULT_WPM} WPM
          {estimatedSeconds > 0 ? <> · model estimated {formatSeconds(estimatedSeconds)}</> : null}
        </div>
      </section>

      <section className="lumo-row">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || body.trim().length === 0}
        >
          {saving ? 'Saving…' : savedId === null ? 'Save script' : 'Save new version'}
        </button>
        {savedId !== null ? <span className="lumo-muted">Saved as script #{savedId}.</span> : null}
      </section>

      <AssistMenu
        selection={selection}
        onAccept={(replacement) => {
          const editor = editorRef.current;
          const sel = editor?.getSelection();
          if (!editor || !sel) return;
          editor.executeEdits('lumo-assist', [
            {
              range: sel,
              text: replacement,
              forceMoveMarkers: true,
            },
          ]);
          setBody(editor.getValue());
        }}
      />
    </main>
  );
}

function computeStats(body: string): { words: number; characters: number; seconds: number } {
  const trimmed = body.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const seconds = (words / DEFAULT_WPM) * 60;
  return { words, characters: body.length, seconds };
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds - mins * 60);
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}
