'use client';

import { useState } from 'react';

export default function NotesPane({ note }) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  if (!note) {
    return (
      <div style={{
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

  const shareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <div style={{
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
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

          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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
            {copiedShare ? 'Link Copied' : 'Share Link'}
          </button>
        </div>
      </div>

      {/* Executive Summary */}
      <section>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
          Executive Summary
        </h3>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          {notes?.summary || 'No summary compiled yet.'}
        </p>
      </section>

      {/* Key Concepts Grid */}
      {notes?.keyConcepts && notes.keyConcepts.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Key Terminology & Definitions
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
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
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.7rem' }}>
            Review Questions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {notes.quizQuestions.map((q, idx) => (
              <details
                key={idx}
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
        )}
      </section>
    </div>
  );
}
