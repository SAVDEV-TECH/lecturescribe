'use client';

import { useState, useEffect } from 'react';

export default function NotesPane({ note, onUpdateNote, onDeleteNote, onOpenStudy }) {
  const [trackedNoteId, setTrackedNoteId] = useState(note?.id);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [revealAllAnswers, setRevealAllAnswers] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isRecompiling, setIsRecompiling] = useState(false);
  const [editTitle, setEditTitle] = useState(note?.title || '');
  const [editTag, setEditTag] = useState(note?.tag || 'General Studies');
  const [editSummary, setEditSummary] = useState(note?.notes?.summary || '');
  const [editTranscript, setEditTranscript] = useState(note?.transcript || '');

  // Reset edit mode when switching notes
  if (note?.id !== trackedNoteId) {
    setTrackedNoteId(note?.id);
    setIsEditing(false);
    setIsRecompiling(false);
    setIsSpeaking(false);
    setRevealAllAnswers(false);
    setEditTitle(note?.title || '');
    setEditTag(note?.tag || 'General Studies');
    setEditSummary(note?.notes?.summary || '');
    setEditTranscript(note?.transcript || '');
  }

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [trackedNoteId]);

  if (!note) {
    return (
      <div className="surface-card" style={{
        padding: '3rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.9rem'
      }}>
        Select or record a lecture to view compiled study materials.
      </div>
    );
  }

  const { title, tag, timestamp, transcript, notes } = note;
  const totalFlashcardsCount =
    (notes?.keyConcepts?.length || 0) + (notes?.quizQuestions?.length || 0) || 1;

  const toggleReadSummary = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textToSpeak = `${title}. Executive Summary: ${notes?.summary || 'No summary compiled yet.'}`;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const startEditing = () => {
    setEditTitle(title || '');
    setEditTag(tag || 'General Studies');
    setEditSummary(notes?.summary || '');
    setEditTranscript(transcript || '');
    setIsEditing(true);
    setShowFullTranscript(true);
  };

  const handleSaveEdits = () => {
    if (!onUpdateNote) {
      setIsEditing(false);
      return;
    }
    const updated = {
      ...note,
      title: editTitle.trim() || 'Untitled Lecture',
      tag: editTag.trim() || 'General Studies',
      transcript: editTranscript,
      notes: {
        ...(notes || {}),
        summary: editSummary
      }
    };
    onUpdateNote(updated);
    setIsEditing(false);
  };

  const handleReanalyze = async () => {
    const activeTranscript = isEditing ? editTranscript : transcript;
    const activeTitle = isEditing ? (editTitle.trim() || 'Untitled Lecture') : title;
    const activeSubject = isEditing ? (editTag.trim() || 'General Studies') : tag;

    if (!activeTranscript || !activeTranscript.trim() || isRecompiling || !onUpdateNote) return;

    setIsRecompiling(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: activeTranscript,
          title: activeTitle,
          subject: activeSubject
        })
      });

      if (res.ok) {
        const compiledNotes = await res.json();
        const updated = {
          ...note,
          title: activeTitle,
          tag: activeSubject,
          transcript: activeTranscript,
          notes: compiledNotes
        };
        onUpdateNote(updated);
        setEditSummary(compiledNotes?.summary || '');
        setIsEditing(false);
      }
    } catch (e) {
      console.warn('Re-compile analysis error:', e);
    } finally {
      setIsRecompiling(false);
    }
  };

  const exportToWord = () => {
    const conceptsHtml = (notes?.keyConcepts || []).map(c => `<li><strong>${c.term}:</strong> ${c.definition}</li>`).join('');
    const outlineHtml = (notes?.outline || []).map(o => `<li>${o}</li>`).join('');

    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>${title}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:2rem;}h1{color:#0f172a;}h2{color:#2563eb;margin-top:1.5rem;}</style></head>
      <body>
        <h1>${title}</h1>
        <p><strong>Subject:</strong> ${tag || 'General'} | <strong>Date:</strong> ${timestamp}</p>
        <hr/>
        <h2>Executive Summary</h2>
        <p>${notes?.summary || 'No summary available.'}</p>
        <h2>Key Concepts</h2>
        <ul>${conceptsHtml}</ul>
        <h2>Lecture Outline</h2>
        <ol>${outlineHtml}</ol>
        <h2>Transcript</h2>
        <p>${transcript}</p>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    window.print();
  };

  const shareLink = async () => {
    const shareUrl = `${window.location.origin}/?note=${encodeURIComponent(note.id)}`;
    const conceptsText = (notes?.keyConcepts || [])
      .map(c => `• ${c.term}: ${c.definition}`)
      .join('\n');
    const sharePayload = [
      `📚 ${title} (${tag || 'General'}) — ${timestamp}`,
      '',
      `Summary: ${notes?.summary || 'No summary compiled.'}`,
      conceptsText ? `\nKey Concepts:\n${conceptsText}` : '',
      `\nOpen in LectureScribe: ${shareUrl}`
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(sharePayload);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2200);
    } catch (e) {
      console.warn('Clipboard copy note:', e);
    }
  };

  return (
    <div className="surface-card" style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      {/* Note Header & Export Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '1.25rem'
      }}>
        <div style={{ flex: 1, minWidth: 'min(100%, 220px)' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  value={editTag}
                  onChange={(e) => setEditTag(e.target.value)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.78rem',
                    color: 'var(--text-main)'
                  }}
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Medicine & Health">Medicine & Health</option>
                  <option value="Economics & Finance">Economics & Finance</option>
                  <option value="Law & Governance">Law & Governance</option>
                  <option value="General Studies">General Studies</option>
                </select>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {timestamp}
                </span>
              </div>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Lecture Title"
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  outline: 'none'
                }}
              />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--primary)'
                }}>
                  {tag || 'General'}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{timestamp}</span>
              </div>

              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                {title}
              </h2>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="no-print notes-action-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {!isEditing && onOpenStudy && (
            <button
              onClick={onOpenStudy}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <span>Study Deck ({totalFlashcardsCount})</span>
            </button>
          )}
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdits}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                Save Changes
              </button>
              <button
                onClick={handleReanalyze}
                disabled={isRecompiling}
                title="Re-synthesize summary, key concepts, outline, and quiz questions from the edited transcript"
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--primary)',
                  color: 'var(--primary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  opacity: isRecompiling ? 0.6 : 1
                }}
              >
                {isRecompiling ? 'Re-Compiling...' : 'Re-Compile AI Notes'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)'
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {onUpdateNote && (
                <>
                  <button
                    onClick={startEditing}
                    style={{
                      padding: '0.45rem 0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: 'var(--text-main)'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleReanalyze}
                    disabled={isRecompiling}
                    title="Re-run AI synthesis on this lecture transcript"
                    style={{
                      padding: '0.45rem 0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: 'var(--primary)',
                      opacity: isRecompiling ? 0.6 : 1
                    }}
                  >
                    {isRecompiling ? 'Compiling...' : 'Re-Analyze'}
                  </button>
                </>
              )}

              <button
                onClick={exportToWord}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                Export Word
              </button>

              <button
                onClick={exportToPDF}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                Print / PDF
              </button>

              <button
                onClick={shareLink}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: copiedShare ? 'var(--success)' : 'var(--bg-surface-elevated)',
                  color: copiedShare ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                {copiedShare ? 'Summary & Link Copied' : 'Share Notes'}
              </button>

              {onDeleteNote && (
                <button
                  onClick={() => onDeleteNote(note.id)}
                  title="Delete this session"
                  style={{
                    padding: '0.45rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'var(--danger)'
                  }}
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Executive Summary
          </h3>
          {!isEditing && (
            <button
              type="button"
              onClick={toggleReadSummary}
              className="no-print"
              style={{
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '0.22rem 0.6rem',
                borderRadius: '4px',
                backgroundColor: isSpeaking ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                color: isSpeaking ? '#fff' : 'var(--primary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <span>{isSpeaking ? '⏹ Stop Audio' : '🔊 Listen to Summary'}</span>
            </button>
          )}
        </div>
        {isEditing ? (
          <textarea
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-strong)',
              fontSize: '0.88rem',
              lineHeight: 1.6,
              color: 'var(--text-main)',
              outline: 'none',
              resize: 'vertical'
            }}
          />
        ) : (
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            {notes?.summary || 'No summary compiled yet.'}
          </p>
        )}
      </section>

      {/* Key Concepts Grid */}
      {notes?.keyConcepts && notes.keyConcepts.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Key Terminology & Definitions
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: '0.75rem' }}>
            {notes.keyConcepts.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.35rem' }}>
                  {item.term}
                </div>
                <div style={{ fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {item.definition}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outline */}
      {notes?.outline && notes.outline.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            Session Outline
          </h3>
          <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {notes.outline.map((point, idx) => (
              <li key={idx} style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {point}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Review Questions */}
      {notes?.quizQuestions && notes.quizQuestions.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              Review Questions
            </h3>
            <button
              type="button"
              onClick={() => setRevealAllAnswers(!revealAllAnswers)}
              className="no-print"
              style={{
                fontSize: '0.74rem',
                fontWeight: 600,
                color: 'var(--primary)'
              }}
            >
              {revealAllAnswers ? 'Hide All Answers' : 'Reveal All Answers'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {notes.quizQuestions.map((q, idx) => (
              <details
                key={`${idx}-${revealAllAnswers}`}
                open={revealAllAnswers ? true : undefined}
                style={{
                  padding: '0.75rem 0.95rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                <summary style={{ fontWeight: 600, color: 'var(--text-main)', outline: 'none' }}>
                  {q.question}
                </summary>
                <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                  <strong>Solution:</strong> {q.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Full Transcript Toggle */}
      <section style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
        <button
          onClick={() => setShowFullTranscript(!showFullTranscript)}
          style={{
            fontSize: '0.8rem',
            color: 'var(--primary)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}
        >
          {showFullTranscript ? 'Hide Raw Transcript' : 'Show Raw Transcript'}
        </button>

        {showFullTranscript && (
          isEditing ? (
            <textarea
              value={editTranscript}
              onChange={(e) => setEditTranscript(e.target.value)}
              rows={7}
              style={{
                marginTop: '0.75rem',
                width: '100%',
                padding: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '0.82rem',
                lineHeight: 1.7,
                color: 'var(--text-main)',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          ) : (
            <div style={{
              marginTop: '0.75rem',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-app)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.82rem',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              maxHeight: '280px',
              overflowY: 'auto'
            }}>
              {transcript || 'No transcript text available.'}
            </div>
          )
        )}
      </section>
    </div>
  );
}
