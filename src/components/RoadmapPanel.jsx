'use client';

export default function RoadmapPanel({ onTryFeature }) {
  const features = [
    {
      title: 'Audio & PDF Capture',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Mic recording with crash checkpoints, chunked large uploads, bookmarks, and PDF/DOCX/PPTX import.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'AI Note Compiler',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Builds summaries, terms, outlines, quizzes, and clickable timestamped transcripts.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Course Exam Mode',
      badge: 'Active',
      color: 'var(--success)',
      desc: '3D flashcards across a lecture or entire course with persistent mastery tracking.',
      action: () => onTryFeature('study')
    },
    {
      title: 'Lecture Assistant',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'AI tutor grounded in a single lecture or full course transcripts.',
      action: () => onTryFeature('study')
    },
    {
      title: 'Cloud Sync',
      badge: 'Synced',
      color: 'var(--primary)',
      desc: 'Supabase sync, guest-note merge on sign-in, auto-reconnect upload, search, and pins.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'PWA & Export',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Screen-off mode, native share, Word, Markdown, Anki CSV, and PDF.',
      action: () => onTryFeature('workspace')
    }
  ];

  return (
    <div className="surface-card" style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '0.4rem' }}>
          System Overview
        </h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          Next.js, Whisper Large V3, Groq AI, and Supabase.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
        {features.map((feat, idx) => (
          <div
            key={idx}
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {feat.title}
                </h3>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.18rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: feat.color,
                  color: '#fff'
                }}>
                  {feat.badge}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {feat.desc}
              </p>
            </div>

            <button
              onClick={feat.action}
              style={{
                alignSelf: 'flex-start',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--primary)',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              Open
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
