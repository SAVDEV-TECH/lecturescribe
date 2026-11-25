'use client';

import { useState, useEffect, useRef } from 'react';
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
import { transcribeAudioWithChunking, polishTranscript } from '@/lib/audioUtils';
import { unpackSupabaseNote, packNotesJsonForSupabase } from '@/lib/noteMeta';
import { initGoogleOneTap } from '@/lib/googleOneTap';

async function migrateAudioKey(oldId, newId) {
  if (!oldId || !newId || String(oldId) === String(newId)) return;
  const existingAudio = await getAudioForNote(oldId);
  if (existingAudio?.blob) {
    await saveAudioForNote(newId, existingAudio.blob, {
      mimeType: existingAudio.mimeType,
      fileName: existingAudio.fileName,
      pendingSync: existingAudio.pendingSync,
      language: existingAudio.language
    });
    await deleteAudioForNote(oldId);
  }
}

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

  const notesRef = useRef([initialSeedNote]);
  const userRef = useRef(null);
  const isSyncingOfflineRef = useRef(false);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? '' : prev));
    }, 2800);
  };

  // Merge guest localStorage notes up to Supabase, then load remote notes
  const loadSupabaseNotes = async (requestedNoteId, currentUser) => {
    try {
      const uid = currentUser?.id;
      if (uid) {
        let localNotes = [];
        try {
          localNotes = JSON.parse(localStorage.getItem('ls_notes') || '[]');
        } catch (e) {}

        const guestNotes = localNotes.filter(
          (n) => String(n.id).startsWith('lecture_')
        );

        if (guestNotes.length > 0) {
          let mergedAny = false;
          const remainingLocal = [...localNotes];
          for (const gNote of guestNotes) {
            try {
              const { data: inserted, error: insertErr } = await supabase
                .from('notes')
                .insert({
                  user_id: uid,
                  title: gNote.title,
                  tag: gNote.tag,
                  transcript: gNote.transcript,
                  notes_json: packNotesJsonForSupabase(gNote)
                })
                .select()
                .single();

              if (!insertErr && inserted?.id) {
                await migrateAudioKey(gNote.id, inserted.id);
                const idx = remainingLocal.findIndex((item) => String(item.id) === String(gNote.id));
                if (idx !== -1) {
                  remainingLocal[idx] = { ...gNote, id: inserted.id };
                }
                mergedAny = true;
              }
            } catch (err) {
              console.warn('Guest note migration note:', err);
            }
          }
          if (mergedAny) {
            localStorage.setItem('ls_notes', JSON.stringify(remainingLocal));
          }
        }
      }

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        let localMetaMap = {};
        try {
          const savedLocal = JSON.parse(localStorage.getItem('ls_notes') || '[]');
          savedLocal.forEach((item) => {
            localMetaMap[String(item.id)] = item;
          });
        } catch (e) {}

        const formatted = data.map((row) => {
          const unpacked = unpackSupabaseNote(row);
          const localMatch = localMetaMap[String(row.id)];
          if (!localMatch) return unpacked;
          return {
            ...unpacked,
            starred: unpacked.starred || Boolean(localMatch.starred),
            masteredIndices: unpacked.masteredIndices.length > 0
              ? unpacked.masteredIndices
              : (localMatch.masteredIndices || []),
            segments: unpacked.segments.length > 0
              ? unpacked.segments
              : (localMatch.segments || []),
            bookmarks: unpacked.bookmarks.length > 0
              ? unpacked.bookmarks
              : (localMatch.bookmarks || []),
            rawTranscript: unpacked.rawTranscript || localMatch.rawTranscript || ''
          };
        });
        setNotes(formatted);
        localStorage.setItem('ls_notes', JSON.stringify(formatted));
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
    const androidAppParam = params.get('androidApp');
    const sharedAudioParam = params.get('sharedAudio');

    if (androidAppParam === '2') {
      sessionStorage.setItem('ls_android_app', '2');
    }

    queueMicrotask(() => {
      setTheme(savedTheme);

      if (actionParam === 'record' || sharedAudioParam === '1') {
        setActiveTab('workspace');
        if (actionParam === 'record') {
          setRecorderResetSignal(prev => prev + 1);
        }
      }

      if (authParam === 'success') {
        showToast('Signed in');
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      } else if (
        androidAppParam === '2' &&
        !actionParam &&
        !noteParam &&
        !codeParam &&
        !sharedAudioParam
      ) {
        window.history.replaceState({}, '', window.location.pathname);
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
            loadSupabaseNotes(noteParam, authenticatedUser);
          }
          showToast('Signed in');
        },
      });
    };

    // Check Supabase Auth
    if (isSupabaseConfigured()) {
      if (codeParam) {
        supabase.auth.exchangeCodeForSession(codeParam).then(({ data }) => {
          if (data?.session?.user) {
            setUser(data.session.user);
            loadSupabaseNotes(noteParam, data.session.user);
            showToast('Signed in');
            window.history.replaceState({}, '', window.location.pathname);
          }
        }).catch(() => {});
      }

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          loadSupabaseNotes(noteParam, session.user);
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
          loadSupabaseNotes(noteParam, session.user);
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

  const persistNoteUpdateToSupabase = async (updatedNote) => {
    if (!isSupabaseConfigured() || !userRef.current) return;
    try {
      await supabase
        .from('notes')
        .update({
          title: updatedNote.title,
          tag: updatedNote.tag,
          transcript: updatedNote.transcript,
          notes_json: packNotesJsonForSupabase(updatedNote)
        })
        .eq('id', updatedNote.id);
    } catch (e) {
      console.warn('Failed to update note in Supabase:', e);
    }
  };

  // Auto-sync any offline-queued audio recordings once connection is online
  useEffect(() => {
    const syncOfflineNotes = async () => {
      if (isSyncingOfflineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      const queued = notesRef.current.filter((n) => n.pendingSync);
      if (queued.length === 0) return;

      isSyncingOfflineRef.current = true;
      let syncedCount = 0;

      try {
        for (const item of queued) {
          const audioRecord = await getAudioForNote(item.id);
          if (!audioRecord?.blob) continue;

          try {
            const { text: freshText, segments: freshSegments } = await transcribeAudioWithChunking({
              blobOrFile: audioRecord.blob,
              fileName: audioRecord.fileName || 'lecture.webm',
              language: audioRecord.language || item.language || 'en'
            });

            const rawTranscript = String(freshText || item.transcript || '').trim();
            let finalTranscript = rawTranscript;
            let finalSegments = freshSegments;

            if (rawTranscript && !rawTranscript.includes('No speech detected')) {
              const polished = await polishTranscript({
                text: rawTranscript,
                segments: freshSegments,
                title: item.title,
                subject: item.tag,
                language: audioRecord.language || item.language || 'en'
              });
              finalTranscript = polished.cleanedText || rawTranscript;
              finalSegments = polished.cleanedSegments.length > 0
                ? polished.cleanedSegments
                : freshSegments;
            }

            let compiledNotes = item.notes;
            const analyzeRes = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transcript: finalTranscript,
                segments: finalSegments,
                title: item.title,
                subject: item.tag
              })
            });
            if (analyzeRes.ok) {
              compiledNotes = await analyzeRes.json();
            }

            await saveAudioForNote(item.id, audioRecord.blob, {
              fileName: audioRecord.fileName,
              language: audioRecord.language,
              pendingSync: false
            });

            const resolvedNote = {
              ...item,
              pendingSync: false,
              rawTranscript: rawTranscript || item.rawTranscript || '',
              transcript: finalTranscript,
              segments: finalSegments.length > 0 ? finalSegments : (item.segments || []),
              notes: compiledNotes
            };

            setNotes((prev) => {
              const next = prev.map((n) => (String(n.id) === String(item.id) ? resolvedNote : n));
              localStorage.setItem('ls_notes', JSON.stringify(next));
              return next;
            });
            await persistNoteUpdateToSupabase(resolvedNote);
            syncedCount++;
          } catch (err) {
            console.warn('Auto offline sync error for note', item.id, err);
          }
        }
        if (syncedCount > 0) {
          showToast('Synced offline audio');
        }
      } finally {
        isSyncingOfflineRef.current = false;
      }
    };

    window.addEventListener('online', syncOfflineNotes);
    const timer = setTimeout(syncOfflineNotes, 1500);
    return () => {
      window.removeEventListener('online', syncOfflineNotes);
      clearTimeout(timer);
    };
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
            notes_json: packNotesJsonForSupabase(newNote)
          })
          .select()
          .single();

        if (!error && data?.id) {
          await migrateAudioKey(newNote.id, data.id);
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
        ? 'Saved offline audio'
        : `Saved "${savedNote.title}"`
    );
  };

  // Handle Update Note (Title, Tag, Summary, Transcript, Segments, Mastery)
  const handleUpdateNote = async (updatedNote, { silent = false } = {}) => {
    const updatedNotes = notes.map(n => (n.id === updatedNote.id ? updatedNote : n));
    setNotes(updatedNotes);
    localStorage.setItem('ls_notes', JSON.stringify(updatedNotes));
    if (!silent) {
      showToast('Notes saved');
    }
    await persistNoteUpdateToSupabase(updatedNote);
  };

  // Toggle Star / Pin on Note
  const handleToggleStarNote = async (noteId) => {
    let updatedTarget = null;
    const updatedNotes = notes.map(n => {
      if (n.id === noteId) {
        updatedTarget = { ...n, starred: !n.starred };
        return updatedTarget;
      }
      return n;
    });
    setNotes(updatedNotes);
    localStorage.setItem('ls_notes', JSON.stringify(updatedNotes));
    if (updatedTarget) {
      showToast(updatedTarget.starred ? 'Pinned' : 'Unpinned');
      await persistNoteUpdateToSupabase(updatedTarget);
    }
  };

  // Handle Delete Note
  const handleDeleteNote = async (noteId) => {
    const remainingNotes = notes.filter(n => n.id !== noteId);
    setNotes(remainingNotes);
    localStorage.setItem('ls_notes', JSON.stringify(remainingNotes));
    deleteAudioForNote(noteId);
    showToast('Deleted');

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
            <StudyDeck
              note={activeNote}
              allNotes={notes}
              onUpdateNote={handleUpdateNote}
            />
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
          if (isSupabaseConfigured()) {
            loadSupabaseNotes(null, u);
          }
          showToast('Signed in');
        }}
      />
    </div>
  );
}
