'use client';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  theme, 
  toggleTheme, 
  onOpenMobileSidebar, 
  onOpenAuthModal, 
  user 
}) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.75rem',
      backgroundColor: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      {/* Left: Mobile menu toggle & Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={onOpenMobileSidebar}
          aria-label="Toggle menu"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            fontSize: '1rem'
          }}
          className="mobile-only-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.82rem',
            letterSpacing: '0.05em'
          }}>
            LS
          </div>
          <div>
            <h1 style={{ fontSize: '0.98rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              LectureScribe
            </h1>
          </div>
        </div>
      </div>

      {/* Middle: Tab Navigation */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-app)',
        padding: '0.2rem',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)'
      }}>
        {[
          { id: 'workspace', label: 'Workspace' },
          { id: 'study', label: 'Study & Review' },
          { id: 'roadmap', label: 'System Overview' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.45rem 1rem',
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Right: Theme Toggle & User Auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          style={{
            padding: '0.45rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-main)',
            fontSize: '0.8rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          {theme === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        <button
          onClick={onOpenAuthModal}
          style={{
            padding: '0.45rem 0.95rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: user ? 'var(--bg-surface-elevated)' : 'var(--primary)',
            color: user ? 'var(--text-main)' : '#fff',
            fontSize: '0.84rem',
            fontWeight: 600,
            border: '1px solid ' + (user ? 'var(--border-subtle)' : 'var(--primary)'),
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {user ? (
            <>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--success)',
                display: 'inline-block'
              }}></span>
              <span>{user.email?.split('@')[0]}</span>
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </div>
    </header>
  );
}
