import { Link } from 'react-router-dom';
import type { EntityProfile } from '../domain/types';

interface EntityNavigatorProps {
  entities: EntityProfile[];
  activeEntityId: string;
  dirty: boolean;
  onSelect: (entityId: string) => void;
  onCreate: () => void;
  onDuplicate: (entityId: string) => void;
  onDelete: (entityId: string) => void;
}

export function EntityNavigator(props: EntityNavigatorProps): JSX.Element {
  const { entities, activeEntityId, dirty, onSelect, onCreate, onDuplicate, onDelete } = props;

  return (
    <section className="navigator-panel" aria-label="Entity Navigator">
      <header>
        <h3>Entities</h3>
        <button
          type="button"
          className="nav-create-btn"
          onClick={onCreate}
          aria-label="Create entity profile"
          title="Create entity profile"
        >
          <span className="nav-btn-label-full">+ New</span>
          <span className="nav-btn-label-compact" aria-hidden>
            +
          </span>
        </button>
      </header>

      <ul>
        {entities.map((entity, index) => {
          const isActive = entity.id === activeEntityId;
          const words = entity.entityName.trim().split(/\s+/).filter(Boolean);
          const compactLabel =
            words.length > 0
              ? words
                  .slice(0, 2)
                  .map((word) => word[0]?.toUpperCase() ?? '')
                  .join('')
              : String(index + 1);

          return (
            <li key={entity.id} className={isActive ? 'is-active' : ''}>
              <button
                type="button"
                className="nav-item-btn"
                onClick={() => onSelect(entity.id)}
                aria-current={isActive}
                aria-label={`Select ${entity.entityName}`}
                title={entity.entityName}
              >
                <span className="nav-item-label-full">{entity.entityName}</span>
                <span className="nav-item-label-compact" aria-hidden>
                  {compactLabel}
                </span>
                {dirty && isActive ? (
                  <small className="dirty-mark" aria-hidden>
                    *
                  </small>
                ) : null}
              </button>

              <div className="nav-inline-actions">
                <button
                  type="button"
                  title="Duplicate entity"
                  aria-label="Duplicate entity"
                  onClick={() => onDuplicate(entity.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  title="Delete entity"
                  aria-label="Delete entity"
                  onClick={() => onDelete(entity.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <footer>
        <Link to="/">Back Home</Link>
      </footer>
    </section>
  );
}
