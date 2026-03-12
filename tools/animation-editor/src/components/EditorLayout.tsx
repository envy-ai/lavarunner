import { useState, type ReactNode } from 'react';

interface MobileTabItem {
  key: 'canvas' | 'timeline' | 'inspector' | 'issues';
  label: string;
  content: ReactNode;
}

interface EditorLayoutProps {
  topBar: ReactNode;
  left: ReactNode;
  canvas: ReactNode;
  timeline: ReactNode;
  inspector: ReactNode;
  issues: ReactNode;
  mobileTab: 'canvas' | 'timeline' | 'inspector' | 'issues';
  onMobileTabChange: (tab: 'canvas' | 'timeline' | 'inspector' | 'issues') => void;
  mobileActions?: ReactNode;
}

const MOBILE_TABS: MobileTabItem[] = [
  { key: 'canvas', label: 'Canvas', content: null },
  { key: 'timeline', label: 'Timeline', content: null },
  { key: 'inspector', label: 'Inspector', content: null },
  { key: 'issues', label: 'Issues', content: null },
];

export function EditorLayout(props: EditorLayoutProps): JSX.Element {
  const {
    topBar,
    left,
    canvas,
    timeline,
    inspector,
    issues,
    mobileTab,
    onMobileTabChange,
    mobileActions,
  } = props;
  const [tabletNavOpen, setTabletNavOpen] = useState(false);
  const [tabletInspectorOpen, setTabletInspectorOpen] = useState(false);

  const mobileContent: Record<typeof mobileTab, ReactNode> = {
    canvas,
    timeline,
    inspector,
    issues,
  };

  return (
    <div
      className={`editor-page ${tabletNavOpen ? 'tablet-nav-open' : ''} ${tabletInspectorOpen ? 'tablet-inspector-open' : ''}`}
    >
      <header className="top-bar">{topBar}</header>

      <div className="desktop-shell" aria-label="Editor Desktop Layout">
        <button
          type="button"
          className="tablet-nav-toggle"
          onClick={() => {
            setTabletInspectorOpen(false);
            setTabletNavOpen((open) => !open);
          }}
          aria-expanded={tabletNavOpen}
          aria-controls="tablet-left-nav"
        >
          Navigator
        </button>
        <aside id="tablet-left-nav" className="left-nav">
          {left}
        </aside>
        <main className="workspace">{canvas}</main>
        <button
          type="button"
          className="tablet-inspector-toggle"
          onClick={() => {
            setTabletNavOpen(false);
            setTabletInspectorOpen((open) => !open);
          }}
          aria-expanded={tabletInspectorOpen}
          aria-controls="tablet-right-inspector"
        >
          Inspector
        </button>
        <aside id="tablet-right-inspector" className="right-inspector">
          {inspector}
        </aside>
        <section className="bottom-panel">
          <div className="bottom-panel-grid">
            <div className="bottom-timeline">{timeline}</div>
            <div className="bottom-issues">{issues}</div>
          </div>
        </section>
      </div>
      <button
        type="button"
        className="tablet-scrim"
        aria-hidden={!tabletNavOpen && !tabletInspectorOpen}
        tabIndex={tabletNavOpen || tabletInspectorOpen ? 0 : -1}
        onClick={() => {
          setTabletNavOpen(false);
          setTabletInspectorOpen(false);
        }}
      />

      <div className="mobile-shell" aria-label="Editor Mobile Layout">
        <aside className="mobile-left-rail">{left}</aside>
        <div className="mobile-tabbar" role="tablist" aria-label="Editor Mobile Panels">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab.key}
              className={`mobile-tab-btn ${mobileTab === tab.key ? 'is-active' : ''}`}
              onClick={() => onMobileTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <main className="mobile-content" role="tabpanel">
          {mobileContent[mobileTab]}
        </main>

        {mobileActions ? <footer className="mobile-actions">{mobileActions}</footer> : null}
      </div>
    </div>
  );
}
