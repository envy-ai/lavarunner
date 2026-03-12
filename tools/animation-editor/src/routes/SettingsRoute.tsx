import { Link } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';

const SHORTCUTS = [
  ['Space', 'Play/Pause'],
  [',', 'Step backward'],
  ['.', 'Step forward'],
  ['K', 'Add keyframe at current counter'],
  ['Delete', 'Remove selected keyframe'],
  ['Ctrl/Cmd + S', 'Save'],
  ['Ctrl/Cmd + D', 'Duplicate selected keyframe'],
  ['F', 'Toggle facing'],
  ['G', 'Toggle grid'],
];

export function SettingsRoute(): JSX.Element {
  const { mode, repositorySupported, repositoryHandles } = useEditorStore();
  const modeLabel = mode === 'repository' ? 'Repository Sync Mode' : 'Portable File Mode';
  const modeDescription =
    mode === 'repository'
      ? 'Saves directly into files under the opened project folder.'
      : 'Saves to export files you choose manually (no direct repo writes).';

  return (
    <main className="settings-screen">
      <header>
        <h1>Settings</h1>
        <p>Application mode and keyboard shortcut reference.</p>
      </header>

      <section className="settings-card">
        <h2>Persistence</h2>
        <p>Current mode: {modeLabel}</p>
        <p>{modeDescription}</p>
        <p>
          Repository support: {repositorySupported ? 'supported' : 'unsupported in this browser'}
        </p>
        <p>Active repository: {repositoryHandles?.rootName ?? 'none'}</p>
      </section>

      <section className="settings-card">
        <h2>Keyboard Shortcuts</h2>
        <ul className="shortcut-list">
          {SHORTCUTS.map(([keys, action]) => (
            <li key={keys}>
              <kbd>{keys}</kbd>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </section>

      <p>
        <Link to="/">Back Home</Link>
      </p>
    </main>
  );
}
