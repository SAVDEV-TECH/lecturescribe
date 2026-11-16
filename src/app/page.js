'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Recorder from '@/components/Recorder';
import NotesPane from '@/components/NotesPane';
import StudyDeck from '@/components/StudyDeck';
import RoadmapPanel from '@/components/RoadmapPanel';
import AuthModal from '@/components/AuthModal';
import MobileBottomNav from '@/components/MobileBottomNav';
import { initialSeedNote } from '@/lib/mockData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAudioForNote, saveAudioForNote, deleteAudioForNote } from '@/lib/audioStorage';
import { initGoogleOneTap } from '@/lib/googleOneTap';

export default function Home() {
  const [activeTab, setActiveTab] = useState('workspace');
  const [theme, setTheme] = useState('dark');
  const [notes, setNotes] = useState([initialSeedNote]);
  const [activeNoteId, setActiveNoteId] = useState(initialSeedNote.id);
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [recorderResetSignal, setRecorderResetSignal] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? '' : prev));
    }, 2800);
  };

  // Sync notes from Supabase
  const loadSupabaseNotes = async (requestedNoteId) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        let starredSet = new Set();
        try {
          const savedLocal = JSON.parse(localStorage.getItem('ls_notes') || '[]');
          savedLocal.forEach(item => {
            if (item.starred) starredSet.add(String(item.id));
          });
        } catch (e) {}

        const formatted = data.map(n => ({
          id: n.id,
          title: n.title,
          tag: n.tag,
          starred: starredSet.has(String(n.id)),
          timestamp: new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          transcript: n.transcript,
          notes: n.notes_json
        }));
        setNotes(formatted);
        const target = requestedNoteId && formatted.some(n => String(n.id) === String(requestedNoteId))
          ? requestedNoteId
          : formatted[0].id;
        setActiveNoteId(target);
      }
    } catch (err) {
      console.warn('Supabase fetch notes error:', err);
    }
  };

  // Load theme, notes, and URL parameters on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('ls_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    localStorage.removeItem('local_student_user');

    const params = new URLSearchParams(window.location.search);
    const actionParam = params.get('action');
    const noteParam = params.get('note');
    const authParam = params.get('auth');
    const codeParam = params.get('code');

    queueMicrotask(() => {
      setTheme(savedTheme);

      if (actionParam === 'record') {
        setActiveTab('workspace');
        setRecorderResetSignal(prev => prev + 1);
      }

      if (authParam === 'success') {
        showToast('Signed in successfully');
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }

      // Initial Local Notes
      const savedNotes = localStorage.getItem('ls_notes');
      if (savedNotes) {
        try {
          const parsed = JSON.parse(savedNotes);
          if (parsed.length > 0) {
            setNotes(parsed);
            const matched = noteParam && parsed.find(n => String(n.id) === String(noteParam));
            setActiveNoteId(matched ? matched.id : parsed[0].id);
          }
        } catch (e) {
          console.warn('Failed to parse local notes', e);
        }
      }
    });

    const triggerOneTapIfLoggedOut = () => {
      initGoogleOneTap({
        promptOneTap: true,
        onSuccess: (authenticatedUser) => {
          setUser(authenticatedUser);
          if (isSupabaseConfigured()) {
            loadSupabaseNotes(noteParam);
          }
          showToast('Signed in with Google One Tap');
        },
      });
    };

    // Check Supabase Auth
    if (isSupabaseConfigured()) {
      if (codeParam) {
        supabase.auth.exchangeCodeForSession(codeParam).then(({ data }) => {
          if (data?.session?.user) {
            setUser(data.session.user);
            loadSupabaseNotes(noteParam);
            showToast('Signed in with Google');
            window.history.replaceState({}, '', window.location.pathname);
          }
        }).catch(() => {});
      }

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          loadSupabaseNotes(noteParam);
        } else {
          const cachedGoogleUser = localStorage.getItem('ls_google_user');
          if (cachedGoogleUser) {
            try {
              setUser(JSON.parse(cachedGoogleUser));
            } catch (e) {
              triggerOneTapIfLoggedOut();
            }
          } else {
            triggerOneTapIfLoggedOut();
          }
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          setUser(session.user);
          loadSupabaseNotes(noteParam);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      const cachedGoogleUser = localStorage.getItem('ls_google_user');
      if (cachedGoogleUser) {
        queueMicrotask(() => {
          try {
            setUser(JSON.parse(cachedGoogleUser));
          } catch (e) {
            triggerOneTapIfLoggedOut();
          }
        });
      } else {
        triggerOneTapIfLoggedOut();
      }
    }
  }, []);

  // Toggle Theme
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('ls_theme', nextTheme);
  };

  // Handle Save Note
  const handleSaveNote = async (newNote) => {
    let savedNote = newNote;

    // If user is logged into Supabase, save to DB and capture DB UUID
    if (isSupabaseConfigured() && user) {
      try {
        const { data, error } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            title: newNote.title,
            tag: newNote.tag,
            transcript: newNote.transcript,
            notes_json: newNote.notes
          })
          .select()
          .single();

        if (!error && data?.id) {
          if (String(data.id) !== String(newNote.id)) {
            const existingAudio = await getAudioForNote(newNote.id);
            if (existingAudio?.blob) {
              await saveAudioForNote(data.id, existingAudio.blob, {
                mimeType: existingAudio.mimeType,
                pendingSync: existingAudio.pendingSync,
                dialect: existingAudio.dialect,
                subject: existingAudio.subject,
                title: existingAudio.title
              });
              await deleteAudioForNote(newNote.id);
            }
          }
          savedNote = { ...newNote, id: data.id };
        }
      } catch (e) {
        console.warn('Failed to insert into Supabase:', e);
      }
    }

    const updatedNotes = [savedNote, ...notes];
    setNotes(updatedNotes);
    setActiveNoteId(savedNote.id);
    localStorage.setItem('ls_notes', JSON.stringify(updatedNotes));
    showToast(
      savedNote.pendingSync
        ? `Offline audio saved for "${savedNote.title}"`
        : `Saved "${savedNote.title}"`
    );
  };

  // Handle Update Note (Edit Title, Tag, Summary, Transcript)
  const handleUpdateNote = async (updatedNote) => {
    const updatedNotes = notes.map(n => (n.id === updatedNote.id ? updatedNote : n));
    setNotes(updatedNotes);
    localStorage.setItem('ls_notes', JSON.stringify(updatedNotes));
    showToast('Lecture notes updated');

    if (isSupabaseConfigured() && user) {
      try {
        await supabase
          .from('notes')
          .update({
            title: updatedNote.title,
            tag: updatedNote.tag,
            transcript: updatedNote.transcript,
            notes_json: updatedNote.notes
          })
          .eq('id', updatedNote.id);
      } catch (e) {
        console.warn('Failed to update note in Supabase:', e);
      }
    }
  };

  // Toggle Star / Pin on Note
  const handleToggleStarNote = (noteId) => {
    let becameStarred = false;
    const updatedNotes = notes.map(n => {
      if (n.id === noteId) {
        becameStarred = !n.starred;
        return { ...n, starred: becameStarred };
      }
      return n;
    });
    setNotes(updatedNotes);
    localStorage.setItem('ls_notes', JSON.stringify(updatedNotes));
    showToast(becameStarred ? 'Pinned lecture to top' : 'Unpinned lecture');
  };

  // Handle Delete Note
  const handleDeleteNote = async (noteId) => {
    const remainingNotes = notes.filter(n => n.id !== noteId);
    setNotes(remainingNotes);
    localStorage.setItem('ls_notes', JSON.stringify(remainingNotes));
    deleteAudioForNote(noteId);
    showToast('Session removed');

    if (activeNoteId === noteId) {
      setActiveNoteId(remainingNotes[0]?.id || null);
    }

    if (isSupabaseConfigured() && user) {
      try {
        await supabase.from('notes').delete().eq('id', noteId);
      } catch (e) {
        console.warn('Failed to delete note from Supabase:', e);
      }
    }
  };

  // Start New Note
  const handleNewNote = () => {
    setActiveTab('workspace');
    setRecorderResetSignal(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Logout
  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch (e) {}
    }
    localStorage.removeItem('local_student_user');
    localStorage.removeItem('ls_google_user');
    setUser(null);
    showToast('Signed out');
  };

  const activeNote = notes.find(n => n.id === activeNoteId) || notes[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', backgroundColor: 'var(--bg-app)' }}>
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        user={user}
      />

      {/* Toast Feedback Banner */}
      {toastMessage && (
        <div className="no-print" style={{
          position: 'fixed',
          top: '4.25rem',
          right: '1rem',
          zIndex: 80,
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--primary)',
          color: 'var(--text-main)',
          padding: '0.55rem 0.95rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          fontWeight: 600,
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)'
        }}>
          ✓ {toastMessage}
        </div>
      )}

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%' }}>
        {/* Left Sidebar */}
        <Sidebar
          notes={notes}
          activeNoteId={activeNoteId}
          onSelectNote={setActiveNoteId}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onToggleStarNote={handleToggleStarNote}
          user={user}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
          isOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content Area */}
        <main style={{ flex: 1, minWidth: 0, maxWidth: '100%', padding: '1.5rem', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Mobile Quick Session Switcher Bar */}
          {activeTab !== 'roadmap' && notes.length > 0 && (
            <div className="mobile-only-flex no-print" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              padding: '0.6rem 0.85rem',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>
                  Session:
                </span>
                <select
                  value={activeNote?.id || ''}
                  onChange={(e) => setActiveNoteId(e.target.value)}
                  aria-label="Select active lecture session"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '0.35rem 0.55rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    outline: 'none'
                  }}
                >
                  {notes.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.starred ? '★ ' : ''}{n.title || 'Untitled'} ({n.tag || 'General'})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  flexShrink: 0
                }}
              >
                All ({notes.length})
              </button>
            </div>
          )}

          {activeTab === 'workspace' && (
            <>
              <Recorder onSaveNote={handleSaveNote} resetSignal={recorderResetSignal} />
              <NotesPane
                note={activeNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                onToggleStarNote={handleToggleStarNote}
                onOpenStudy={() => {
                  setActiveTab('study');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}

          {activeTab === 'study' && (
            <StudyDeck note={activeNote} />
          )}

          {activeTab === 'roadmap' && (
            <RoadmapPanel onTryFeature={(tab) => setActiveTab(tab)} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSidebar={() => setIsMobileSidebarOpen(true)}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        user={user}
        onLogout={handleLogout}
        onAuthSuccess={(u) => {
          setUser(u);
          showToast('Signed in successfully');
        }}
      />
    </div>
  );
}
