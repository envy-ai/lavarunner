import { Link, useLocation } from 'react-router-dom';

interface TopBarProps {
  title: string;
  dirty: boolean;
  mode: 'portable' | 'repository';
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveDisabled: boolean;
}

export function TopBar(props: TopBarProps): JSX.Element {
  const {
    title,
    dirty,
    mode,
    onSave,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    saveDisabled,
  } = props;

  const location = useLocation();
  const modeLabel = mode === 'repository' ? 'Repository Sync Mode' : 'Portable File Mode';

  return (
    <div className="top-bar-inner">
      <div className="brand-column">
        <h1>{title}</h1>
        <p>
          Mode: <strong>{modeLabel}</strong>{' '}
          {dirty ? <span className="dirty-pill">Unsaved</span> : <span className="clean-pill">Saved</span>}
        </p>
      </div>

      <nav className="top-nav" aria-label="Primary routes">
        <Link className={location.pathname === '/' ? 'active' : ''} to="/">
          Home
        </Link>
        <Link className={location.pathname.startsWith('/entity/') ? 'active' : ''} to="/entity/active">
          Entity
        </Link>
        <Link className={location.pathname.startsWith('/weapon/') ? 'active' : ''} to="/weapon/active/0">
          Weapon
        </Link>
        <Link className={location.pathname === '/settings' ? 'active' : ''} to="/settings">
          Settings
        </Link>
      </nav>

      <div className="top-actions">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
          Redo
        </button>
        <button type="button" className="save-btn" onClick={onSave} disabled={saveDisabled}>
          Save
        </button>
      </div>
    </div>
  );
}
