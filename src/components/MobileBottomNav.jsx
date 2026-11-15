'use client';

export default function MobileBottomNav({ activeTab, setActiveTab, onOpenSidebar }) {
  return (
    <nav className="mobile-bottom-nav" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '62px',
      backgroundColor: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 50,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      boxShadow: '0 -4px 15px rgba(0, 0, 0, 0.25)'
    }}>
      {/* Workspace / Record */}
      <button
        onClick={() => setActiveTab('workspace')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          padding: '0.35rem 0.65rem',
          color: activeTab === 'workspace' ? 'var(--primary)' : 'var(--text-muted)'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
        </svg>
        <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'workspace' ? 700 : 500 }}>Record</span>
      </button>

      {/* Study Deck */}
      <button
        onClick={() => setActiveTab('study')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          padding: '0.35rem 0.65rem',
          color: activeTab === 'study' ? 'var(--primary)' : 'var(--text-muted)'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
        </svg>
        <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'study' ? 700 : 500 }}>Study</span>
      </button>

      {/* Lectures Drawer */}
      <button
        onClick={onOpenSidebar}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          padding: '0.35rem 0.65rem',
          color: 'var(--text-muted)'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        <span style={{ fontSize: '0.68rem', fontWeight: 500 }}>Lectures</span>
      </button>

      {/* Overview */}
      <button
        onClick={() => setActiveTab('roadmap')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          padding: '0.35rem 0.65rem',
          color: activeTab === 'roadmap' ? 'var(--primary)' : 'var(--text-muted)'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'roadmap' ? 700 : 500 }}>System</span>
      </button>
    </nav>
  );
}
