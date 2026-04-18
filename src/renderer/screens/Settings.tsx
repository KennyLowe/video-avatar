import { useCallback, useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { ProviderStatus } from '@renderer/components/ProviderStatus.js';
import { KeyEntryDialog } from '@renderer/components/KeyEntryDialog.js';
import type { AppSettings } from '@shared/schemas/settings.js';

// Settings per FR-051. One screen, subsections for providers, Claude Code
// defaults, upload transport, render defaults, projects root, logs,
// appearance.

interface Props {
  projectSlug: string | null;
}

export function Settings({ projectSlug }: Props): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [reKeying, setReKeying] = useState<'elevenlabs' | 'heygen' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const s = await unwrap(lumo.settings.get());
      setSettings(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(patch: Partial<AppSettings>): Promise<void> {
    setSaving(true);
    try {
      const next = await unwrap(lumo.settings.update(patch));
      setSettings(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function pickRoot(): Promise<void> {
    try {
      await unwrap(lumo.settings.pickProjectsRoot());
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function clearCredential(provider: 'elevenlabs' | 'heygen'): Promise<void> {
    try {
      await unwrap(lumo.credentials.clear({ provider }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function openLogs(): Promise<void> {
    try {
      await unwrap(lumo.jobs.showLog());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (settings === null) {
    return (
      <main className="lumo-settings">
        <header>
          <h1>Settings</h1>
        </header>
        <p className="lumo-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="lumo-settings">
      <header>
        <h1>Settings</h1>
      </header>

      {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}

      <section className="lumo-settings__section">
        <h2>Providers</h2>
        <ProviderStatus projectSlug={projectSlug} />
        <div className="lumo-row">
          <button type="button" onClick={() => setReKeying('elevenlabs')}>
            Set ElevenLabs key
          </button>
          <button type="button" onClick={() => void clearCredential('elevenlabs')}>
            Clear ElevenLabs
          </button>
          <button type="button" onClick={() => setReKeying('heygen')}>
            Set HeyGen key
          </button>
          <button type="button" onClick={() => void clearCredential('heygen')}>
            Clear HeyGen
          </button>
        </div>
      </section>

      <section className="lumo-settings__section">
        <h2>Claude Code defaults</h2>
        <label>
          Default model
          <input
            className="lumo-input"
            value={settings.defaultClaudeModel}
            onChange={(e) => void update({ defaultClaudeModel: e.target.value })}
            disabled={saving}
          />
        </label>
      </section>

      <section className="lumo-settings__section">
        <h2>Upload transport</h2>
        <label>
          Default transport
          <select
            value={settings.defaultUploadTransport}
            onChange={(e) =>
              void update({
                defaultUploadTransport: e.target.value as AppSettings['defaultUploadTransport'],
              })
            }
            disabled={saving}
          >
            <option value="heygen">heygen (HeyGen asset upload)</option>
            <option value="s3">s3 (pre-signed URL — Phase 8)</option>
            <option value="r2">r2 (Cloudflare R2 pre-signed URL — Phase 8)</option>
            <option value="cloudflared">cloudflared (local tunnel — Phase 8)</option>
          </select>
        </label>
      </section>

      <section className="lumo-settings__section">
        <h2>Render defaults</h2>
        <div className="lumo-row">
          <label>
            Resolution
            <select
              value={settings.renderDefaults.resolution}
              onChange={(e) =>
                void update({
                  renderDefaults: {
                    ...settings.renderDefaults,
                    resolution: e.target.value as AppSettings['renderDefaults']['resolution'],
                  },
                })
              }
              disabled={saving}
            >
              <option value="1080p30">1080p30</option>
              <option value="1080p60">1080p60</option>
              <option value="4k30">4K30</option>
            </select>
          </label>
          <label>
            Codec
            <select
              value={settings.renderDefaults.codec}
              onChange={(e) =>
                void update({
                  renderDefaults: {
                    ...settings.renderDefaults,
                    codec: e.target.value as AppSettings['renderDefaults']['codec'],
                  },
                })
              }
              disabled={saving}
            >
              <option value="h264">h264</option>
              <option value="h265">h265</option>
            </select>
          </label>
          <label>
            Preset
            <select
              value={settings.renderDefaults.preset}
              onChange={(e) =>
                void update({
                  renderDefaults: {
                    ...settings.renderDefaults,
                    preset: e.target.value as AppSettings['renderDefaults']['preset'],
                  },
                })
              }
              disabled={saving}
            >
              <option value="fast">fast</option>
              <option value="balanced">balanced</option>
              <option value="quality">quality</option>
            </select>
          </label>
          <label>
            Audio bitrate
            <input
              className="lumo-input"
              value={settings.renderDefaults.audioBitrate}
              onChange={(e) =>
                void update({
                  renderDefaults: { ...settings.renderDefaults, audioBitrate: e.target.value },
                })
              }
              disabled={saving}
            />
          </label>
        </div>
      </section>

      <section className="lumo-settings__section">
        <h2>Projects folder</h2>
        <p className="lumo-muted">
          Projects root: <code>{settings.projectsRoot ?? '(not set)'}</code>
        </p>
        <button type="button" onClick={() => void pickRoot()} disabled={saving}>
          Change…
        </button>
      </section>

      <section className="lumo-settings__section">
        <h2>Logs</h2>
        <div className="lumo-row">
          <label>
            Level
            <select
              value={settings.logLevel}
              onChange={(e) => void update({ logLevel: e.target.value as AppSettings['logLevel'] })}
              disabled={saving}
            >
              <option value="info">info</option>
              <option value="debug">debug</option>
              <option value="trace">trace</option>
            </select>
          </label>
          <label>
            Retention (days)
            <input
              type="number"
              min="1"
              max="365"
              className="lumo-input"
              value={settings.logRetentionDays}
              onChange={(e) =>
                void update({
                  logRetentionDays: Math.max(1, Number.parseInt(e.target.value, 10) || 14),
                })
              }
              disabled={saving}
            />
          </label>
          <button type="button" onClick={() => void openLogs()}>
            Open logs folder
          </button>
        </div>
      </section>

      <section className="lumo-settings__section">
        <h2>Appearance</h2>
        <div className="lumo-row">
          <label>
            Theme
            <select
              value={settings.appearance}
              onChange={(e) =>
                void update({ appearance: e.target.value as AppSettings['appearance'] })
              }
              disabled={saving}
            >
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.compactDensity}
              onChange={(e) => void update({ compactDensity: e.target.checked })}
              disabled={saving}
            />{' '}
            Compact density
          </label>
        </div>
      </section>

      {reKeying !== null ? (
        <KeyEntryDialog
          provider={reKeying}
          onSaved={() => {
            setReKeying(null);
            void load();
          }}
          onCancel={() => setReKeying(null)}
        />
      ) : null}
    </main>
  );
}
