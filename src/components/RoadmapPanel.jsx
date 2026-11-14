'use client';

export default function RoadmapPanel({ onTryFeature }) {
  const features = [
    {
      title: 'Whisper Speech Pipeline',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'High-speed audio transcription powered by Whisper Large V3 Turbo. Supports continuous recording with automatic silence handling and multi-dialect English recognition.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Structured Note Synthesizer',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Transforms raw spoken transcripts into concise executive summaries, categorized glossaries of key terms, chronological lecture outlines, and review prompts.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Active-Recall Flashcards',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Generates flipping flashcards from lecture definitions and quiz questions to empower spaced repetition and active recall study.',
      action: () => onTryFeature('study')
    },
    {
      title: 'Interactive Lecture Assistant',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'A conversational assistant grounded in the lecture transcript. Students can ask for clarifications, quizzes, or step-by-step concept explanations.',
      action: () => onTryFeature('study')
    },
    {
      title: 'Database Cloud Sync',
      badge: 'Integrated',
      color: 'var(--primary)',
      desc: 'Cloud persistence for user notes with Row Level Security (RLS) policies. Includes an automatic guest mode fallback using local storage when offline.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Document Exporting',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'One-click export to formatted Microsoft Word (.doc) and printable PDF layouts for printing or studying on any device.',
      action: () => onTryFeature('workspace')
    }
  ];

  return (
    <div style={{
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
          System Capabilities & Technical Overview
        </h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          Powered by Next.js 14 App Router, Groq Whisper Large V3, high-throughput inference, and PostgreSQL.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
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
              Open Module
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
