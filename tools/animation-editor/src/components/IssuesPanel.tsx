import type { ValidationIssue } from '../domain/types';

interface IssuesPanelProps {
  issues: ValidationIssue[];
  onJumpToPath: (path: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  anim_duration: 'Animation Duration',
  cancel: 'Cancel Window',
  knockback: 'Knockback',
  origin: 'Weapon Origin',
  stopMove: 'Stop Movement During Attack',
  eval: 'Custom Script Text',
  frames: 'Keyframes',
  anim: 'Keyframes',
  bbox: 'Hitbox',
  sprite: 'Sprite',
  reset: 'Reset Counter',
  power: 'Power',
  sfx: 'Sound Effect',
  xm: 'Motion Offset X',
  ym: 'Motion Offset Y',
};

const SPRITE_INDEX_LABELS = ['Sprite Start', 'Sprite Width', 'Sprite Height'];

function toLabelCase(value: string): string {
  const words = value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0);
  return words.map((segment) => segment[0].toUpperCase() + segment.slice(1)).join(' ');
}

function labelForSegment(segment: string): string {
  return FIELD_LABELS[segment] ?? toLabelCase(segment);
}

function expandIndexedSegment(segment: string): string[] {
  const match = segment.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/);
  if (!match) {
    return [labelForSegment(segment)];
  }

  const base = match[1];
  const index = Number(match[2]);
  if (base === 'sprite' && SPRITE_INDEX_LABELS[index]) {
    return [SPRITE_INDEX_LABELS[index]];
  }

  return [labelForSegment(base), `Index ${index + 1}`];
}

function formatWeaponPath(weaponName: string, chainIndex: number, remainder: string): string {
  const labels: string[] = [`Weapon ${weaponName}`, `Chain ${chainIndex + 1}`];
  if (!remainder) {
    return labels.join(' > ');
  }

  const segments = remainder.split('.');
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === 'frames') {
      labels.push('Keyframes');
      const threshold = segments[index + 1];
      if (threshold && /^\d+$/.test(threshold)) {
        labels.push(`Keyframe ${threshold}`);
        index += 1;
      }
      continue;
    }
    if (segment === 'sprite') {
      const spriteIndex = segments[index + 1];
      if (spriteIndex && /^\d+$/.test(spriteIndex)) {
        labels.push(SPRITE_INDEX_LABELS[Number(spriteIndex)] ?? `Sprite Index ${Number(spriteIndex) + 1}`);
        index += 1;
        continue;
      }
    }
    labels.push(...expandIndexedSegment(segment));
  }

  return labels.join(' > ');
}

function formatEntityPath(path: string): string {
  const segments = path.split('.');
  const entityName = segments[0];
  const labels: string[] = [`Entity ${entityName}`];

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === 'states') {
      const stateKey = segments[index + 1];
      if (stateKey) {
        labels.push(`State ${stateKey}`);
        index += 1;
      } else {
        labels.push('States');
      }
      continue;
    }
    if (segment === 'anim') {
      labels.push('Keyframes');
      const threshold = segments[index + 1];
      if (threshold && /^\d+$/.test(threshold)) {
        labels.push(`Keyframe ${threshold}`);
        index += 1;
      }
      continue;
    }
    if (segment === 'bbox') {
      labels.push('Body Hitbox');
      continue;
    }
    if (segment === 'sprite') {
      const spriteIndex = segments[index + 1];
      if (spriteIndex && /^\d+$/.test(spriteIndex)) {
        labels.push(SPRITE_INDEX_LABELS[Number(spriteIndex)] ?? `Sprite Index ${Number(spriteIndex) + 1}`);
        index += 1;
        continue;
      }
    }
    labels.push(...expandIndexedSegment(segment));
  }

  return labels.join(' > ');
}

function formatIssuePath(path: string): string {
  const weaponBracketMatch = path.match(/^([^.[]+)\[(\d+)\](?:\.(.*))?$/);
  if (weaponBracketMatch) {
    return formatWeaponPath(
      weaponBracketMatch[1],
      Number(weaponBracketMatch[2]),
      weaponBracketMatch[3] ?? '',
    );
  }

  const weaponDotMatch = path.match(/^([^.]+)\.(\d+)\.(.*)$/);
  if (weaponDotMatch) {
    return formatWeaponPath(weaponDotMatch[1], Number(weaponDotMatch[2]), weaponDotMatch[3]);
  }

  if (path.includes('.states.') || path.includes('.bbox') || path.endsWith('.states')) {
    return formatEntityPath(path);
  }

  return path
    .split('.')
    .flatMap((segment) => expandIndexedSegment(segment))
    .join(' > ');
}

export function IssuesPanel(props: IssuesPanelProps): JSX.Element {
  const { issues, onJumpToPath } = props;

  if (issues.length === 0) {
    return (
      <section className="issues-panel">
        <h3>Issues</h3>
        <p className="empty-state">No issues detected.</p>
      </section>
    );
  }

  return (
    <section className="issues-panel" aria-label="Validation Issues">
      <h3>Issues</h3>
      <ul>
        {issues.map((issue) => {
          const friendlyPath = formatIssuePath(issue.path);
          return (
            <li key={issue.id} className={`issue-row ${issue.severity}`}>
              <div className="issue-main">
                <span className="issue-severity" aria-hidden="true">
                  {issue.severity === 'error' ? 'Error' : 'Warn'}
                </span>
                <button
                  type="button"
                  className="issue-jump"
                  onClick={() => onJumpToPath(issue.path)}
                  title={issue.path}
                >
                  {friendlyPath}
                </button>
              </div>
              <p className="issue-raw-path">{issue.path}</p>
              <p>{issue.message}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
