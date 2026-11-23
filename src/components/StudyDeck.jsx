'use client';

import { useState, useEffect } from 'react';
import { buildFlashcardsFromNotes } from '@/lib/noteMeta';

function buildCourseTranscriptContext(courseNotes) {
  if (!courseNotes.length) return '';
  const perNoteBudget = Math.max(800, Math.floor(11000 / courseNotes.length));
  return courseNotes
    .map((n) => `[${n.title || 'Lecture'}]\n${(n.transcript || '').slice(0, perNoteBudget)}`)
    .join('\n\n');
}

function loadCourseMastered(courseName) {
  if (typeof window === 'undefined' || !courseName) return [];
  try {
    const raw = localStorage.getItem(`ls_course_mastery_${courseName}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function StudyDeck({ note, allNotes = [], onUpdateNote }) {
  const [trackedNoteId, setTrackedNoteId] = useState(note?.id);
  const [studyScope, setStudyScope] = useState('single'); // 'single' | 'course'
  const [selectedCourse, setSelectedCourse] = useState(note?.tag || 'Computer Science');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredIndices, setMasteredIndices] = useState(() =>
    Array.isArray(note?.masteredIndices) ? note.masteredIndices : []
  );

  // Assistant state
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: `Ask about "${note?.title || 'this lecture'}" or pick a prompt.`
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const courses = Array.from(
    new Set((allNotes.length > 0 ? allNotes : (note ? [note] : [])).map((n) => n.tag || 'General').filter(Boolean))
  );
  const effectiveCourse = courses.includes(selectedCourse) ? selectedCourse : (note?.tag || courses[0] || 'General');
  const courseNotes = (allNotes.length > 0 ? allNotes : (note ? [note] : [])).filter(
    (n) => (n.tag || 'General') === effectiveCourse
  );

  // Reset study deck & restore persisted mastery when switching active lecture
  if (note?.id !== trackedNoteId) {
    setTrackedNoteId(note?.id);
    setSelectedCourse(note?.tag || 'Computer Science');
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setMasteredIndices(
      studyScope === 'course'
        ? loadCourseMastered(note?.tag || effectiveCourse)
        : (Array.isArray(note?.masteredIndices) ? note.masteredIndices : [])
    );
    setInputMessage('');
    setMessages([
      {
        sender: 'assistant',
        text: studyScope === 'course'
          ? `Exam mode for ${note?.tag || effectiveCourse}. Ask across all lectures.`
          : `Ask about "${note?.title || 'this lecture'}" or pick a prompt.`
      }
    ]);
  }

  // Build flashcards from active lecture OR entire course in Exam Mode
  const activeNotesList = studyScope === 'course' ? courseNotes : (note ? [note] : []);
  const flashcards = buildFlashcardsFromNotes(activeNotesList);

  if (flashcards.length === 0 && note) {
    flashcards.push({
      type: 'Summary',
      front: note.title,
      back: note.notes?.summary || 'No summary yet.'
    });
  }

  const totalCards = Math.max(1, flashcards.length);

  // Keyboard navigation for flashcards (Left/Right arrows & Spacebar to flip)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsFlipped(false);
        setCurrentCardIndex(prev => (prev + 1) % totalCards);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsFlipped(false);
        setCurrentCardIndex(prev => (prev - 1 + totalCards) % totalCards);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalCards]);

  if (!note && allNotes.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Select a lecture to study.
      </div>
    );
  }

  const activeIndex = currentCardIndex % flashcards.length;
  const currentCard = flashcards[activeIndex];
  const isCurrentMastered = masteredIndices.includes(activeIndex);

  const switchScope = (nextScope, nextCourse = effectiveCourse) => {
    setStudyScope(nextScope);
    setSelectedCourse(nextCourse);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setMasteredIndices(
      nextScope === 'course'
        ? loadCourseMastered(nextCourse)
        : (Array.isArray(note?.masteredIndices) ? note.masteredIndices : [])
    );
    setMessages([
      {
        sender: 'assistant',
        text: nextScope === 'course'
          ? `Exam mode for ${nextCourse}. Ask across all lectures.`
          : `Ask about "${note?.title || 'this lecture'}" or pick a prompt.`
      }
    ]);
  };

  const toggleMastered = () => {
    const next = masteredIndices.includes(activeIndex)
      ? masteredIndices.filter(i => i !== activeIndex)
      : [...masteredIndices, activeIndex];
    setMasteredIndices(next);

    if (studyScope === 'course') {
      try {
        localStorage.setItem(`ls_course_mastery_${effectiveCourse}`, JSON.stringify(next));
      } catch {}
    } else if (note && onUpdateNote) {
      onUpdateNote({ ...note, masteredIndices: next }, { silent: true });
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        sender: 'assistant',
        text: studyScope === 'course'
          ? `Exam mode for ${effectiveCourse}. Ask across all lectures.`
          : `Ask about "${note?.title || 'this lecture'}" or pick a prompt.`
      }
    ]);
  };

  const nextCard = () => {
    setIsFlipped(false);
    setCurrentCardIndex(prev => (prev + 1) % flashcards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentCardIndex(prev => (prev - 1 + flashcards.length) % flashcards.length);
  };

  const handleSendMessage = async (customPrompt) => {
    const textToSend = customPrompt || inputMessage;
    if (!textToSend.trim() || isSending) return;

    const newMessages = [...messages, { sender: 'user', text: textToSend }];
    setMessages(newMessages);
    setInputMessage('');
    setIsSending(true);

    const tutorTranscript = studyScope === 'course'
      ? buildCourseTranscriptContext(courseNotes)
      : (note?.transcript || '');
    const tutorTitle = studyScope === 'course'
      ? `${effectiveCourse} (${courseNotes.length} lectures)`
      : (note?.title || 'Lecture');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          transcript: tutorTranscript,
          noteTitle: tutorTitle
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...newMessages, { sender: 'assistant', text: data.reply }]);
      } else {
        let errorMsg = 'Unable to reach AI tutor. Try again.';
        try {
          const errData = await res.json();
          if (errData?.error) errorMsg = `Tutor error: ${errData.error}`;
        } catch {}
        setMessages([...newMessages, { sender: 'assistant', text: errorMsg }]);
      }
    } catch (e) {
      setMessages([...newMessages, { sender: 'assistant', text: 'Failed to send.' }]);
    } finally {
      setIsSending(false);
    }
  };

  const speakCurrentCard = (e) => {
    e.stopPropagation();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = isFlipped ? currentCard.back : currentCard.front;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Scope Switcher: Single Lecture vs Course Exam Mode */}
      <div className="surface-card" style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.6rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => switchScope('single')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: studyScope === 'single' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: studyScope === 'single' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            This Lecture
          </button>
          <button
            type="button"
            onClick={() => switchScope('course')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: studyScope === 'course' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: studyScope === 'course' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            Course Exam ({courseNotes.length})
          </button>
        </div>

        {studyScope === 'course' && courses.length > 0 && (
          <select
            value={effectiveCourse}
            onChange={(e) => switchScope('course', e.target.value)}
            aria-label="Select course for exam mode"
            style={{
              padding: '0.38rem 0.7rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-main)'
            }}
          >
            {courses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem' }} className="study-grid">
      {/* LEFT: Flashcards */}
      <div className="surface-card" style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '420px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Flashcards</h2>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Tap or Space to flip · Arrows to move</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={speakCurrentCard}
                title="Read card aloud"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--primary)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                Listen
              </button>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '0.2rem 0.55rem',
                borderRadius: '4px',
                backgroundColor: masteredIndices.length === flashcards.length ? 'var(--success-soft)' : 'var(--bg-surface-elevated)',
                color: masteredIndices.length === flashcards.length ? 'var(--success)' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)'
              }}>
                {masteredIndices.length}/{flashcards.length} mastered
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {activeIndex + 1} / {flashcards.length}
              </span>
            </div>
          </div>

          {/* Interactive Flip Card */}
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className={`flip-card ${isFlipped ? 'flipped' : ''}`}
            style={{ width: '100%', height: '260px', cursor: 'pointer', margin: '0 auto' }}
          >
            <div className="flip-card-inner">
              {/* Front */}
              <div className="flip-card-front">
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--primary)',
                  marginBottom: '0.75rem'
                }}>
                  {currentCard.type} {isCurrentMastered ? '· Mastered' : ''}
                </span>
                <div style={{ fontSize: '1.08rem', fontWeight: 700, lineHeight: 1.4, color: 'var(--text-main)', textAlign: 'center' }}>
                  {currentCard.front}
                </div>
                <div style={{ marginTop: '1.25rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Tap to flip
                </div>
              </div>

              {/* Back */}
              <div className="flip-card-back">
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--success)',
                  marginBottom: '0.75rem'
                }}>
                  Answer
                </span>
                <div style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-main)', textAlign: 'center' }}>
                  {currentCard.back}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <button
            onClick={prevCard}
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: 'var(--text-main)'
            }}
          >
            Prev
          </button>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.82rem',
                fontWeight: 500,
                color: 'var(--primary)'
              }}
            >
              Flip
            </button>
            <button
              onClick={toggleMastered}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isCurrentMastered ? 'var(--success-soft)' : 'var(--bg-surface-elevated)',
                border: `1px solid ${isCurrentMastered ? 'var(--success)' : 'var(--border-subtle)'}`,
                fontSize: '0.82rem',
                fontWeight: 600,
                color: isCurrentMastered ? 'var(--success)' : 'var(--text-secondary)'
              }}
            >
              {isCurrentMastered ? 'Mastered' : 'Mark Known'}
            </button>
          </div>

          <button
            onClick={nextCard}
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            Next
          </button>
        </div>
      </div>

      {/* RIGHT: Assistant Chat */}
      <div className="surface-card" style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        height: '520px'
      }}>
        <div style={{
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '0.85rem',
          marginBottom: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              AI Tutor
            </h2>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Ask about this lecture
            </p>
          </div>
          {messages.length > 1 && (
            <button
              onClick={handleResetChat}
              style={{
                fontSize: '0.72rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontWeight: 500
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Quick prompt pills */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          {[
            '3-point summary',
            'Practice question',
            'Explain key terms'
          ].map((pill, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(pill)}
              style={{
                fontSize: '0.72rem',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              {pill}
            </button>
          ))}
        </div>

        {/* Message History */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '0.75rem 0.95rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: m.sender === 'user' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                color: m.sender === 'user' ? '#fff' : 'var(--text-main)',
                fontSize: '0.84rem',
                lineHeight: 1.5,
                border: m.sender === 'user' ? 'none' : '1px solid var(--border-subtle)'
              }}
            >
              {m.text}
            </div>
          ))}
          {isSending && (
            <div style={{ alignSelf: 'flex-start', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div className="spinner" /> Thinking...
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem' }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Ask a question..."
            style={{
              flex: 1,
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.84rem',
              outline: 'none'
            }}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isSending || !inputMessage.trim()}
            style={{
              padding: '0.65rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              fontSize: '0.84rem',
              fontWeight: 600,
              opacity: isSending || !inputMessage.trim() ? 0.6 : 1
            }}
          >
            Send
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
