import { useEffect, useState } from 'react';
import { lumo, unwrap } from '@renderer/lib/lumo.js';
import { ClaudeBanner } from '@renderer/components/ClaudeBanner.js';
import { AsyncFeedback } from '@renderer/components/AsyncFeedback.js';
import type { Project, ProjectSummary } from '@shared/schemas/project.js';

// Minimal Home shell per T040. Lets the operator:
//   - Pick a projects root on first run (or change it in Settings later).
//   - List existing projects in the root.
//   - Create a new project.
//   - Open an existing project.
// The full grid with thumbnails, quick actions, and a delete flow lands in
// Phase 7 T118 / T119.

export function Home(): JSX.Element {
  const [projectsRoot, setProjectsRoot] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [claudeOk, setClaudeOk] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(): Promise<void> {
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
  }

  async function pickRoot(): Promise<void> {
    setPendingAction('Choosing projects folder…');
    try {
      const picked = await unwrap(lumo.settings.pickProjectsRoot());
      if (picked !== null) await refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function createProject(): Promise<void> {
    const name = window.prompt('Name the new project');
    if (name === null || name.trim().length === 0) return;
    setPendingAction('Creating project…');
    try {
      await unwrap(lumo.projects.create({ name: name.trim() }));
      await refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function openProject(slug: string): Promise<void> {
    setPendingAction(`Opening ${slug}…`);
    try {
      const project: Project = await unwrap(lumo.projects.open({ slug }));
      // Phase 2 has no project-workspace screen yet — just log for now.
      // The router in Phase 3+ dispatches to the Script studio.
      console.info('opened project', project.slug);
    } finally {
      setPendingAction(null);
    }
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

      {loading ? (
        <AsyncFeedback kind="typical" hint="Loading projects…" />
      ) : summaries.length === 0 ? (
        projectsRoot === null ? null : (
          <p className="lumo-home__empty">No projects yet. Create your first one above.</p>
        )
      ) : (
        <ul className="lumo-home__list">
          {summaries.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => void openProject(s.slug)}>
                <strong>{s.name}</strong>
                <span className="lumo-home__slug">{s.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
