import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateEntityProfile } from '../domain/validation';
import { downloadPortableBundle, importPortableBundleFromPicker } from '../io/portable';
import { openRepositoryFolder, openWeaponsJsonFileWithPicker } from '../io/repository';
import { useEditorStore } from '../store/editorStore';

const RECENT_KEY = 'animation-editor.recent-projects';

function readRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushRecentProject(name: string): void {
  const next = [name, ...readRecentProjects().filter((entry) => entry !== name)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function ProjectHome(): JSX.Element {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    repositorySupported,
    setMode,
    setRepositoryHandles,
    setActiveError,
    loadWeapons,
    loadEntityProfiles,
    createEntity,
    exportBundlePayload,
    importBundle,
  } = useEditorStore();

  const recentProjects = readRecentProjects();

  return (
    <main className="home-screen">
      <header>
        <h1>LavaRunner Animation Editor</h1>
        <p>
          Standalone authoring tool for entity states, body hitboxes, and weapon attack chains.
        </p>
      </header>

      <section className="home-grid">
        <article className="home-card">
          <h2>Recent Projects</h2>
          {recentProjects.length === 0 ? (
            <p className="empty-state">No recent repository folders yet.</p>
          ) : (
            <ul>
              {recentProjects.map((project) => (
                <li key={project}>{project}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="home-card">
          <h2>Open Weapon JSON</h2>
          <p>Manual file import for `assets/data/weapons.json` (enters Portable File Mode).</p>
          <button
            type="button"
            onClick={async () => {
              try {
                const result = await openWeaponsJsonFileWithPicker();
                loadWeapons(result.weapons);
                setMode('portable');
                navigate('/weapon/active/0');
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setActiveError(message, 'open-weapons-json');
              }
            }}
          >
            Open Weapon JSON
          </button>
        </article>

        <article className="home-card">
          <h2>Create Entity Profile</h2>
          <p>Starts from the default profile and opens the entity editor.</p>
          <button
            type="button"
            onClick={() => {
              createEntity();
              navigate('/entity/active');
            }}
          >
            Create Entity Profile
          </button>
        </article>

        <article className="home-card">
          <h2>Import Entity Profile JSON</h2>
          <p>Load a profile export and append it to the current session.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const validation = validateEntityProfile(parsed);
                if (!validation.profile) {
                  const first = validation.issues[0];
                  throw new Error(
                    `Entity profile invalid at ${first?.path ?? 'unknown'}: ${first?.message ?? 'unknown'}`,
                  );
                }

                const existing = useEditorStore.getState().entityProfiles;
                loadEntityProfiles([...existing, validation.profile]);
                navigate('/entity/active');
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setActiveError(message, 'import-entity-profile');
              } finally {
                event.target.value = '';
              }
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import Entity Profile JSON
          </button>
        </article>

        <article className="home-card">
          <h2>Open Folder (Repository Sync Mode)</h2>
          {!repositorySupported ? (
            <p className="explicit-warning">
              File System Access API is unavailable in this browser. Repository Sync Mode is blocked. Use Portable File Mode instead.
            </p>
          ) : (
            <>
              <p>Open a repo folder to save weapon/entity edits directly to project files.</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await openRepositoryFolder();
                    setRepositoryHandles(result.handles);
                    loadWeapons(result.weapons);
                    setMode('repository');
                    pushRecentProject(result.handles.rootName);
                    navigate('/weapon/active/0');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    setActiveError(message, 'open-repository-folder');
                  }
                }}
              >
                Open Repository Folder
              </button>
            </>
          )}
        </article>

        <article className="home-card">
          <h2>Portable File Mode Bundle</h2>
          <p>Export or import one bundle file containing entities and weapons.</p>
          <div className="inline-actions">
            <button
              type="button"
              onClick={() => {
                try {
                  downloadPortableBundle(exportBundlePayload());
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  setActiveError(message, 'export-portable-bundle');
                }
              }}
            >
              Export Bundle
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const bundle = await importPortableBundleFromPicker();
                  importBundle(bundle);
                  setMode('portable');
                  navigate('/entity/active');
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  setActiveError(message, 'import-portable-bundle');
                }
              }}
            >
              Import Bundle
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
