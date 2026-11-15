'use client';

import { useState } from 'react';

export default function Sidebar({
  notes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  user,
  onOpenAuthModal,
  onLogout,
  isOpen,
  onCloseMobile
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');

  // Unique tags from notes
  const availableTags = ['All', ...Array.from(new Set(notes.map(n => n.tag || 'General').filter(Boolean)))];

  const filteredNotes = notes.filter(note => {
    const matchesTag = selectedTag === 'All' || (note.tag || 'General') === selectedTag;
    if (!matchesTag) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (note.title || '').toLowerCase().includes(q) ||
      (note.tag || '').toLowerCase().includes(q) ||
      (note.transcript || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 40,
            backdropFilter: 'blur(2px)'
          }}
        />
      )}

      <aside
        style={{
          width: '270px',
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flexShrink: 0,
          zIndex: 45,
          transition: 'transform 0.25s ease',
        }}
        className={`app-sidebar ${isOpen ? 'sidebar-open' : ''}`}
      >
        {/* Top Header: New Lecture & Search */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <button
            onClick={() => {
              onNewNote();
              onCloseMobile();
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.86rem',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>New Lecture</span>
          </button>

          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.78rem',
                outline: 'none',
                color: 'var(--text-main)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '0.45rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Subject Filter Pills */}
          {availableTags.length > 2 && (
            <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>
              {availableTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: selectedTag === tag ? 700 : 500,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: selectedTag === tag ? 'var(--primary)' : 'var(--bg-surface)',
                    color: selectedTag === tag ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notes History List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            padding: '0.25rem 0.5rem 0.5rem'
          }}>
            Recorded Sessions ({filteredNotes.length})
          </div>

          {filteredNotes.length === 0 ? (
            <div style={{
              padding: '1.25rem 0.5rem',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.5
            }}>
              {notes.length === 0
                ? 'No sessions recorded yet. Start recording or upload an audio file.'
                : 'No sessions match your search filter.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {filteredNotes.map(note => {
                const isActive = note.id === activeNoteId;
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      onSelectNote(note.id);
                      onCloseMobile();
                    }}
                    style={{
                      padding: '0.75rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                      border: `1px solid ${isActive ? 'var(--border-strong)' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.4rem',
                      marginBottom: '0.3rem'
                    }}>
                      <div style={{
                        fontSize: '0.86rem',
                        fontWeight: 600,
                        color: isActive ? 'var(--text-main)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1
                      }}>
                        {note.title || 'Untitled Session'}
                      </div>

                      {onDeleteNote && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNote(note.id);
                          }}
                          title="Delete session"
                          aria-label={`Delete ${note.title || 'session'}`}
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.78rem',
                            padding: '0.1rem 0.25rem',
                            borderRadius: '4px',
                            flexShrink: 0,
                            opacity: 0.75
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.12rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        fontWeight: 500
                      }}>
                        {note.tag || 'General'}
                      </span>
                      <span>{note.timestamp || 'Recent'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: User / Cloud Sync Status */}
        <div style={{
          padding: '0.85rem 1rem',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              backgroundColor: user ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: user ? '#fff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.78rem',
              fontWeight: 700,
              flexShrink: 0
            }}>
              {user ? user.email?.charAt(0).toUpperCase() : 'U'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: user ? 'var(--text-main)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user ? user.email : 'Guest Session'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: user ? 'var(--success)' : 'var(--warning)',
                  display: 'inline-block'
                }}></span>
                <span>{user ? 'Cloud Sync' : 'Local Storage'}</span>
              </div>
            </div>
          </div>

          {user ? (
            <button
              onClick={onLogout}
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                padding: '0.3rem 0.55rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={onOpenAuthModal}
              style={{
                fontSize: '0.74rem',
                color: 'var(--primary)',
                fontWeight: 600,
                padding: '0.3rem 0.55rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
