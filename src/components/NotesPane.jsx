'use client';

import { useState, useEffect, useRef } from 'react';
import { getAudioForNote, saveAudioForNote } from '@/lib/audioStorage';

function buildMultipleChoiceQuestion(q, idx, allQuestions = [], allConcepts = []) {
  if (Array.isArray(q.options) && q.options.length >= 2 && typeof q.correctIndex === 'number') {
    return {
      question: q.question,
      answer: q.answer,
      options: q.options,
      correctIndex: q.correctIndex
    };
  }

  // Construct deterministic 4-choice options for legacy notes that only have question + answer
  const distractorPool = [
    ...allQuestions.filter((_, i) => i !== idx).map(item => item.answer),
    ...allConcepts.map(c => c.definition),
    'This topic was deferred to a future laboratory seminar and not covered in this session.',
    'It relies exclusively on manual trial-and-error without theoretical structure.',
    'It is an outdated historical hypothesis that has been replaced in modern practice.'
  ].filter(text => text && text !== q.answer);

  const uniqueDistractors = Array.from(new Set(distractorPool)).slice(0, 3);
  while (uniqueDistractors.length < 3) {
    uniqueDistractors.push(`Alternative interpretation ${uniqueDistractors.length + 1}`);
  }

  const targetCorrectIndex = idx % 4;
  const options = [...uniqueDistractors];
  options.splice(targetCorrectIndex, 0, q.answer);

  return {
    question: q.question,
    answer: q.answer,
    options: options.slice(0, 4),
    correctIndex: targetCorrectIndex
  };
}

export default function NotesPane({ note, onUpdateNote, onDeleteNote, onToggleStarNote, onOpenStudy }) {
  const [trackedNoteId, setTrackedNoteId] = useState(note?.id);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [revealAllAnswers, setRevealAllAnswers] = useState(false);

  // Interactive Quiz state
  const [quizMode, setQuizMode] = useState('interactive');
  const [selectedAnswers, setSelectedAnswers] = useState({});

  // Local Audio Player & Offline Sync state
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioRecord, setAudioRecord] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [actionError, setActionError] = useState('');
  const audioPlayerRef = useRef(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isRecompiling, setIsRecompiling] = useState(false);
  const [editTitle, setEditTitle] = useState(note?.title || '');
  const [editTag, setEditTag] = useState(note?.tag || 'General Studies');
  const [editSummary, setEditSummary] = useState(note?.notes?.summary || '');
  const [editTranscript, setEditTranscript] = useState(note?.transcript || '');

  // Reset state when switching notes
  if (note?.id !== trackedNoteId) {
    setTrackedNoteId(note?.id);
    setIsEditing(false);
    setIsRecompiling(false);
    setIsSpeaking(false);
    setRevealAllAnswers(false);
    setSelectedAnswers({});
    setAudioUrl(null);
    setAudioRecord(null);
    setPlaybackRate(1);
    setIsSyncingOffline(false);
    setActionError('');
    setEditTitle(note?.title || '');
    setEditTag(note?.tag || 'General Studies');
    setEditSummary(note?.notes?.summary || '');
    setEditTranscript(note?.transcript || '');
  }

  // Load local audio blob from IndexedDB for this lecture
  useEffect(() => {
    let activeObjectUrl = null;
    let cancelled = false;

    if (trackedNoteId) {
      getAudioForNote(trackedNoteId).then((record) => {
        if (cancelled) return;
        if (record?.blob) {
          activeObjectUrl = URL.createObjectURL(record.blob);
          setAudioUrl(activeObjectUrl);
          setAudioRecord(record);
        }
      });
    }

    return () => {
      cancelled = true;
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
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
        Select or record a lecture.
      </div>
    );
  }

  const { title, tag, timestamp, transcript, notes } = note;
  const totalFlashcardsCount =
    (notes?.keyConcepts?.length || 0) + (notes?.quizQuestions?.length || 0) || 1;
  const isOfflineQueued = Boolean(note.pendingSync || audioRecord?.pendingSync);

  const handlePlaybackSpeed = (rate) => {
    setPlaybackRate(rate);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = rate;
    }
  };

  // Sync an offline-queued audio recording with Groq Whisper + AI Note Synthesizer
  const handleSyncOfflineAudio = async () => {
    if (!audioRecord?.blob || isSyncingOffline || !onUpdateNote) return;

    setIsSyncingOffline(true);
    try {
      const formData = new FormData();
      formData.append('file', audioRecord.blob, audioRecord.fileName || 'lecture.webm');
      formData.append('language', audioRecord.language || note.language || 'en');

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!transcribeRes.ok) {
        throw new Error('Transcription request failed');
      }

      const transcribeData = await transcribeRes.json();
      const freshTranscript = transcribeData.text || transcript;

      let compiledNotes = notes;
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: freshTranscript,
          title,
          subject: tag
        })
      });

      if (analyzeRes.ok) {
        compiledNotes = await analyzeRes.json();
      }

      await saveAudioForNote(note.id, audioRecord.blob, {
        fileName: audioRecord.fileName,
        language: audioRecord.language,
        pendingSync: false
      });

      setAudioRecord(prev => (prev ? { ...prev, pendingSync: false } : prev));

      onUpdateNote({
        ...note,
        pendingSync: false,
        transcript: freshTranscript,
        notes: compiledNotes
      });
    } catch (err) {
      console.warn('Offline audio sync error:', err);
    } finally {
      setIsSyncingOffline(false);
    }
  };

  const toggleReadSummary = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textToSpeak = `${title}. ${notes?.summary || 'No summary yet.'}`;
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
    setActionError('');
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
        setSelectedAnswers({});
        setIsEditing(false);
      } else {
        let msg = `Analysis failed (${res.status}).`;
        try {
          const errData = await res.json();
          if (errData?.error) msg = errData.error;
        } catch {}
        setActionError(msg);
      }
    } catch (e) {
      console.warn('Re-compile analysis error:', e);
      setActionError(e?.message || 'Network error while analyzing notes.');
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
        <p><strong>${tag || 'General'}</strong> | ${timestamp}</p>
        <hr/>
        <h2>Summary</h2>
        <p>${notes?.summary || 'No summary.'}</p>
        <h2>Key Terms</h2>
        <ul>${conceptsHtml}</ul>
        <h2>Outline</h2>
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
      `${title} (${tag || 'General'}) — ${timestamp}`,
      '',
      `Summary: ${notes?.summary || 'No summary.'}`,
      conceptsText ? `\nKey Terms:\n${conceptsText}` : '',
      `\n${shareUrl}`
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
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  list="subject-tag-suggestions"
                  value={editTag}
                  onChange={(e) => setEditTag(e.target.value)}
                  placeholder="Subject or Course Code (e.g. CSC 301)"
                  style={{
                    padding: '0.38rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.78rem',
                    color: 'var(--text-main)',
                    outline: 'none'
                  }}
                />
                <datalist id="subject-tag-suggestions">
                  <option value="Computer Science" />
                  <option value="Engineering" />
                  <option value="Medicine & Health" />
                  <option value="Economics & Finance" />
                  <option value="Law & Governance" />
                  <option value="General Studies" />
                </datalist>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
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
                {note.starred && (
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.18rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: 'var(--warning)'
                  }}>
                    ★ Pinned
                  </span>
                )}
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
              <span>Study ({totalFlashcardsCount})</span>
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
                Save
              </button>
              <button
                onClick={handleReanalyze}
                disabled={isRecompiling}
                title="Re-generate AI notes from transcript"
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
                {isRecompiling ? 'Compiling...' : 'Re-Analyze'}
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
              {onToggleStarNote && (
                <button
                  onClick={() => onToggleStarNote(note.id)}
                  title={note.starred ? 'Unpin session' : 'Pin session'}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: note.starred ? 'var(--warning)' : 'var(--text-main)'
                  }}
                >
                  {note.starred ? '★ Pinned' : '☆ Pin'}
                </button>
              )}

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
                    title="Re-run AI notes"
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
                Word
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
                PDF
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
                {copiedShare ? 'Copied' : 'Share'}
              </button>

              {onDeleteNote && (
                <button
                  onClick={() => onDeleteNote(note.id)}
                  title="Delete session"
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

      {actionError && (
        <div className="no-print" style={{
          padding: '0.65rem 0.9rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: '0.8rem'
        }}>
          {actionError}
        </div>
      )}

      {/* Offline Recording Queue Sync Banner */}
      {isOfflineQueued && (
        <div className="no-print" style={{
          padding: '0.9rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid var(--warning)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--warning)' }}>Offline Audio Queued:</strong>{' '}
            Saved locally. Connect online to transcribe and summarize.
          </div>
          {audioRecord?.blob && (
            <button
              type="button"
              onClick={handleSyncOfflineAudio}
              disabled={isSyncingOffline}
              style={{
                padding: '0.5rem 0.95rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--warning)',
                color: '#0f172a',
                fontSize: '0.8rem',
                fontWeight: 700,
                opacity: isSyncingOffline ? 0.65 : 1
              }}
            >
              {isSyncingOffline ? 'Syncing...' : 'Sync Audio'}
            </button>
          )}
        </div>
      )}

      {/* Embedded Lecture Audio Playback Bar (IndexedDB) */}
      {audioUrl && (
        <div className="no-print" style={{
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Lecture Audio
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>Speed:</span>
              {[1, 1.25, 1.5, 2].map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handlePlaybackSpeed(rate)}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: playbackRate === rate ? 700 : 500,
                    padding: '0.18rem 0.45rem',
                    borderRadius: '4px',
                    backgroundColor: playbackRate === rate ? 'var(--primary)' : 'var(--bg-surface)',
                    color: playbackRate === rate ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  {rate}x
                </button>
              ))}
              <a
                href={audioUrl}
                download={audioRecord?.fileName || `${title.replace(/[^a-z0-9]/gi, '_')}.webm`}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--primary)',
                  textDecoration: 'none',
                  marginLeft: '0.35rem'
                }}
              >
                Download
              </a>
            </div>
          </div>
          <audio
            ref={audioPlayerRef}
            controls
            src={audioUrl}
            style={{ width: '100%', height: '38px' }}
          />
        </div>
      )}

      {/* Summary */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Summary
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
              <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
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
            {notes?.summary || 'No summary yet.'}
          </p>
        )}
      </section>

      {/* Key Concepts Grid */}
      {notes?.keyConcepts && notes.keyConcepts.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Key Terms
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
            Outline
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

      {/* Review Questions & Interactive Multiple-Choice Quiz */}
      {notes?.quizQuestions && notes.quizQuestions.length > 0 && (() => {
        const builtQuestions = notes.quizQuestions.map((q, idx) =>
          buildMultipleChoiceQuestion(q, idx, notes.quizQuestions, notes.keyConcepts || [])
        );
        const answeredCount = Object.keys(selectedAnswers).length;
        const correctCount = builtQuestions.reduce((acc, q, idx) => {
          return selectedAnswers[idx] === q.correctIndex ? acc + 1 : acc;
        }, 0);

        return (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  Quiz
                </h3>
                {quizMode === 'interactive' && (
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.18rem 0.55rem',
                    borderRadius: '4px',
                    backgroundColor: answeredCount > 0 ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-surface-elevated)',
                    color: answeredCount > 0 ? 'var(--success)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    {correctCount} / {builtQuestions.length}
                  </span>
                )}
              </div>

              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                {quizMode === 'interactive' && answeredCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAnswers({})}
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.22rem 0.55rem',
                      borderRadius: '4px',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setQuizMode(quizMode === 'interactive' ? 'study' : 'interactive')}
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '0.22rem 0.6rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--primary)'
                  }}
                >
                  {quizMode === 'interactive' ? 'Answer Key' : 'Quiz Mode'}
                </button>
                {quizMode === 'study' && (
                  <button
                    type="button"
                    onClick={() => setRevealAllAnswers(!revealAllAnswers)}
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: 'var(--primary)'
                    }}
                  >
                    {revealAllAnswers ? 'Hide All' : 'Show All'}
                  </button>
                )}
              </div>
            </div>

            {quizMode === 'interactive' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {builtQuestions.map((q, qIdx) => {
                  const chosen = selectedAnswers[qIdx];
                  const isAnswered = typeof chosen === 'number';
                  return (
                    <div
                      key={qIdx}
                      style={{
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem'
                      }}
                    >
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.5 }}>
                        {qIdx + 1}. {q.question}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {q.options.map((opt, optIdx) => {
                          const isSelected = chosen === optIdx;
                          const isCorrectOption = optIdx === q.correctIndex;
                          let bg = 'var(--bg-surface)';
                          let border = 'var(--border-subtle)';
                          let textColor = 'var(--text-secondary)';

                          if (isAnswered) {
                            if (isCorrectOption) {
                              bg = 'rgba(16, 185, 129, 0.14)';
                              border = 'var(--success)';
                              textColor = 'var(--text-main)';
                            } else if (isSelected) {
                              bg = 'rgba(239, 68, 68, 0.14)';
                              border = 'var(--danger)';
                              textColor = 'var(--text-main)';
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => {
                                if (!isAnswered) {
                                  setSelectedAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
                                }
                              }}
                              style={{
                                textAlign: 'left',
                                padding: '0.6rem 0.8rem',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: bg,
                                border: `1px solid ${border}`,
                                color: textColor,
                                fontSize: '0.82rem',
                                lineHeight: 1.5,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.5rem',
                                cursor: isAnswered ? 'default' : 'pointer'
                              }}
                            >
                              <span style={{ fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <span style={{ flex: 1 }}>{opt}</span>
                              {isAnswered && isCorrectOption && (
                                <span style={{ color: 'var(--success)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                              )}
                              {isAnswered && isSelected && !isCorrectOption && (
                                <span style={{ color: 'var(--danger)', fontWeight: 700, flexShrink: 0 }}>✕</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {isAnswered && (
                        <div style={{
                          marginTop: '0.2rem',
                          paddingTop: '0.55rem',
                          borderTop: '1px solid var(--border-subtle)',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.6
                        }}>
                          <strong style={{ color: chosen === q.correctIndex ? 'var(--success)' : 'var(--warning)' }}>
                            {chosen === q.correctIndex ? 'Correct: ' : 'Answer: '}
                          </strong>
                          {q.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
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
                      <strong>Answer:</strong> {q.answer}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        );
      })()}

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
          {showFullTranscript ? 'Hide Transcript' : 'Show Transcript'}
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
              {transcript || 'No transcript available.'}
            </div>
          )
        )}
      </section>
    </div>
  );
}
