import { Link } from 'react-router-dom';
import type { WeaponsFile } from '../domain/types';

interface WeaponNavigatorProps {
  weapons: WeaponsFile;
  activeWeaponName: string;
  activeChainIndex: number;
  onSelectWeapon: (weaponName: string, chainIndex: number) => void;
  onCreateChain: (weaponName: string) => void;
  onDuplicateChain: (weaponName: string, chainIndex: number) => void;
  onDeleteChain: (weaponName: string, chainIndex: number) => void;
}

export function WeaponNavigator(props: WeaponNavigatorProps): JSX.Element {
  const {
    weapons,
    activeWeaponName,
    activeChainIndex,
    onSelectWeapon,
    onCreateChain,
    onDuplicateChain,
    onDeleteChain,
  } = props;

  return (
    <section className="navigator-panel" aria-label="Weapon Navigator">
      <header>
        <h3>Weapons</h3>
      </header>

      <ul className="weapon-list">
        {Object.entries(weapons).map(([weaponName, chains]) => {
          const isWeaponActive = weaponName === activeWeaponName;
          const shortWeaponName = weaponName
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() ?? '')
            .join('');
          return (
            <li key={weaponName} className={isWeaponActive ? 'is-active' : ''}>
              <h4 title={weaponName}>
                <span className="weapon-name-full">{weaponName}</span>
                <span className="weapon-name-compact" aria-hidden>
                  {shortWeaponName || weaponName.slice(0, 2).toUpperCase()}
                </span>
              </h4>
              <div className="weapon-chain-list">
                {chains.map((_, chainIndex) => {
                  const active = isWeaponActive && chainIndex === activeChainIndex;
                  const chainLabel = `Chain ${chainIndex + 1}`;
                  return (
                    <button
                      key={`${weaponName}-${chainIndex}`}
                      type="button"
                      className={`chain-button ${active ? 'is-active' : ''}`}
                      onClick={() => onSelectWeapon(weaponName, chainIndex)}
                      aria-label={`${weaponName} ${chainLabel}`}
                      title={`${weaponName} ${chainLabel}`}
                    >
                      <span className="chain-label-full">{chainLabel}</span>
                      <span className="chain-label-compact" aria-hidden>
                        C{chainIndex + 1}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="nav-inline-actions">
                <button type="button" onClick={() => onCreateChain(weaponName)}>
                  + Chain
                </button>
                <button type="button" onClick={() => onDuplicateChain(weaponName, activeChainIndex)}>
                  Duplicate
                </button>
                <button type="button" onClick={() => onDeleteChain(weaponName, activeChainIndex)}>
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
