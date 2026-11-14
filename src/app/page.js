'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Recorder from '@/components/Recorder';
import NotesPane from '@/components/NotesPane';
import StudyDeck from '@/components/StudyDeck';
import RoadmapPanel from '@/components/RoadmapPanel';
import AuthModal from '@/components/AuthModal';
import { initialSeedNote } from '@/lib/mockData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function Home() {
  const [activeTab, setActiveTab] = useState('workspace');
  const [theme, setTheme] = useState('dark');
  const [notes, setNotes] = useState([initialSeedNote]);
  const [activeNoteId, setActiveNoteId] = useState(initialSeedNote.id);
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load theme and notes on mount
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem('ls_theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Initial Local Notes
    const savedNotes = localStorage.getItem('ls_notes');
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes);
        if (parsed.length > 0) {
          setNotes(parsed);
          setActiveNoteId(parsed[0].id);
        }
      } catch (e) {
        console.warn('Failed to parse local notes', e);
      }
    }

    // Check Supabase Auth
    if (isSupabaseConfigured()) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          loadSupabaseNotes(session.user.id);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser(session.user);
          loadSupabaseNotes(session.user.id);
        } else {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // Check local guest user
      const localUser = localStorage.getItem('local_student_user');
      if (localUser) {
        try { setUser(JSON.parse(localUser)); } catch (e) {}
      }
    }
  }, []);

  // Sync notes to Supabase
  const loadSupabaseNotes = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const formatted = data.map(n => ({
          id: n.id,
          title: n.title,
          tag: n.tag,
          timestamp: new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          transcript: n.transcript,
          notes: n.notes_json
        }));
        setNotes(formatted);
        setActiveNoteId(formatted[0].id);
      }
    } catch (err) {
      console.warn('Supabase fetch notes error:', err);
    }
  };

  // Toggle Theme
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('ls_theme', nextTheme);
  };

  // Handle Save Note
  const handleSaveNote = async (newNote) => {
    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    setActiveNoteId(newNote.id);
    localStorage.setItem('ls_notes', JSON.stringify(updatedNotes));

    // If user is logged into Supabase, save to DB
    if (isSupabaseConfigured() && user) {
      try {
        await supabase.from('notes').insert({
          user_id: user.id,
          title: newNote.title,
          tag: newNote.tag,
          transcript: newNote.transcript,
          notes_json: newNote.notes
        });
      } catch (e) {
        console.warn('Failed to insert into Supabase:', e);
      }
    }
  };

  // Start New Note
  const handleNewNote = () => {
    setActiveTab('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Logout
  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('local_student_user');
    setUser(null);
  };

  const activeNote = notes.find(n => n.id === activeNoteId) || notes[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-app)' }}>
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

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <Sidebar
          notes={notes}
          activeNoteId={activeNoteId}
          onSelectNote={setActiveNoteId}
          onNewNote={handleNewNote}
          user={user}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
          isOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content Area */}
        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {activeTab === 'workspace' && (
            <>
              <Recorder onSaveNote={handleSaveNote} />
              <NotesPane note={activeNote} />
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

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(u) => setUser(u)}
      />

      {/* Global Responsive Mobile Styles */}
      <style jsx global>{`
        @media (max-width: 900px) {
          .study-grid {
            grid-template-columns: 1fr !important;
          }
          .recorder-meta-grid {
            grid-template-columns: 1fr !important;
          }
          .app-sidebar {
            position: fixed !important;
            top: 0;
            bottom: 0;
            left: 0;
            transform: translateX(-100%);
            box-shadow: 10px 0 25px rgba(0, 0, 0, 0.4);
          }
          .sidebar-open {
            transform: translateX(0) !important;
          }
        }
        @media (min-width: 901px) {
          .mobile-only-btn {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
