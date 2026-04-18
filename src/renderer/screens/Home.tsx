import { useCallback, useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { ClaudeBanner } from '@renderer/components/ClaudeBanner.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import { DeleteProjectDialog } from '@renderer/components/DeleteProjectDialog.js';
import { usePrompt } from '@renderer/components/PromptProvider.js';
import type { Project, ProjectSummary } from '@shared/schemas/project.js';

// Home per FR-008. Project grid with last-modified + per-project actions
// (open, rename, duplicate, delete, reveal). Delete goes through the two-
// step confirmation dialog (FR-009); backend uses shell.trashItem so the
// folder is recoverable from the Recycle Bin.

interface Props {
  onOpenProject?: (slug: string) => void;
}

export function Home({ onOpenProject }: Props = {}): JSX.Element {
  const [projectsRoot, setProjectsRoot] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [claudeOk, setClaudeOk] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prompt = usePrompt();

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await unwrap(lumo.settings.get());
      setProjectsRoot(settings.projectsRoot);
      if (settings.projectsRoot !== null) {
        const list = await unwrap(lumo.projects.list());
        setSummaries(list);
      } else {
        setSummaries([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function pickRoot(): Promise<void> {
    setPendingAction('Choosing projects folder…');
    try {
      const picked = await unwrap(lumo.settings.pickProjectsRoot());
      if (picked !== null) await refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function openProject(slug: string): Promise<void> {
    setPendingAction(`Opening ${slug}…`);
    try {
      const project: Project = await unwrap(lumo.projects.open({ slug }));
      onOpenProject?.(project.slug);
    } finally {
      setPendingAction(null);
    }
  }

  async function createProject(): Promise<void> {
    const name = await prompt('Name the new project');
    if (name === null || name.trim().length === 0) return;
    setPendingAction('Creating project…');
    try {
      const project = await unwrap(lumo.projects.create({ name: name.trim() }));
      if (onOpenProject) {
        onOpenProject(project.slug);
      } else {
        await refresh();
      }
    } finally {
      setPendingAction(null);
    }
  }

  async function renameProject(summary: ProjectSummary): Promise<void> {
    const next = await prompt('New project name', summary.name);
    if (next === null || next.trim().length === 0 || next.trim() === summary.name) return;
    setPendingAction('Renaming…');
    setError(null);
    try {
      await unwrap(lumo.projects.rename({ slug: summary.slug, newName: next.trim() }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  async function duplicateProject(summary: ProjectSummary): Promise<void> {
    setPendingAction(`Duplicating ${summary.name}…`);
    setError(null);
    try {
      await unwrap(lumo.projects.duplicate({ slug: summary.slug }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  async function revealProject(summary: ProjectSummary): Promise<void> {
    try {
      await unwrap(lumo.projects.revealInExplorer({ slug: summary.slug }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleting === null) return;
    await unwrap(lumo.projects.delete({ slug: deleting.slug, confirmName: deleting.name }));
    setDeleting(null);
    await refresh();
  }

  return (
    <main className="lumo-home">
      <ClaudeBanner onResolved={() => setClaudeOk(true)} />
      <header className="lumo-home__header">
        <h1>Lumo</h1>
        {projectsRoot === null ? (
          <p>Pick a folder to hold your projects. Lumo will own every sub-path beneath it.</p>
        ) : (
          <p>
            Projects folder: <code>{projectsRoot}</code>
          </p>
        )}
      </header>

      <section className="lumo-home__actions">
        <button type="button" onClick={() => void pickRoot()} disabled={pendingAction !== null}>
          {projectsRoot === null ? 'Choose projects folder' : 'Change projects folder'}
        </button>
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={projectsRoot === null || pendingAction !== null || !claudeOk}
          aria-keyshortcuts="Control+N"
        >
          New project <kbd>Ctrl+N</kbd>
        </button>
      </section>

      {pendingAction !== null ? <AsyncFeedback kind="typical" hint={pendingAction} /> : null}
      {error !== null ? <div className="lumo-banner lumo-banner--block">{error}</div> : null}

      {loading ? (
        <AsyncFeedback kind="typical" hint="Loading projects…" />
      ) : summaries.length === 0 ? (
        projectsRoot === null ? null : (
          <p className="lumo-home__empty">No projects yet. Create your first one above.</p>
        )
      ) : (
        <ul className="lumo-home__grid">
          {summaries.map((s) => (
            <li key={s.id} className="lumo-project-card">
              <button
                type="button"
                className="lumo-project-card__open"
                onClick={() => void openProject(s.slug)}
              >
                <strong>{s.name}</strong>
                <span className="lumo-project-card__slug">{s.slug}</span>
                {s.lastModifiedAt !== null ? (
                  <span className="lumo-project-card__meta">
                    modified {formatRelative(s.lastModifiedAt)}
                  </span>
                ) : null}
              </button>
              <details
                className="lumo-project-card__menu"
                open={menuOpenFor === s.slug}
                onToggle={(e) =>
                  setMenuOpenFor((e.currentTarget as HTMLDetailsElement).open ? s.slug : null)
                }
              >
                <summary aria-label={`Actions for ${s.name}`}>⋯</summary>
                <div className="lumo-project-card__menu-list">
                  <button type="button" onClick={() => void renameProject(s)}>
                    Rename…
                  </button>
                  <button type="button" onClick={() => void duplicateProject(s)}>
                    Duplicate
                  </button>
                  <button type="button" onClick={() => void revealProject(s)}>
                    Reveal in Explorer
                  </button>
                  <button type="button" onClick={() => setDeleting(s)} className="lumo-danger">
                    Delete…
                  </button>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {deleting !== null ? (
        <DeleteProjectDialog
          projectName={deleting.name}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </main>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
