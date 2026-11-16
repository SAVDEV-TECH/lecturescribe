'use client';

export default function RoadmapPanel({ onTryFeature }) {
  const features = [
    {
      title: 'Multi-Source Audio & Text Capture',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Live microphone recording with 32 kbps speech compression, pre-recorded audio file upload (.mp3, .wav, .m4a, .webm), and raw text/slide paste mode with multi-dialect recognition (including Nigerian Pidgin, Igbo, and Yoruba).',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Structured Note Synthesizer',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Transforms raw transcripts into executive summaries, categorized key-term glossaries, chronological outlines, and self-assessment prompts—with full inline editing and one-click AI re-analysis.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Active-Recall Flashcards',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Generates interactive 3D flipping flashcards from lecture definitions and quiz questions with keyboard navigation (Arrow keys + Spacebar) and per-card mastery tracking.',
      action: () => onTryFeature('study')
    },
    {
      title: 'Interactive Lecture Assistant',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'A conversational AI tutor grounded in the active lecture transcript. Students can ask for clarifications, practice quizzes, or step-by-step concept breakdowns.',
      action: () => onTryFeature('study')
    },
    {
      title: 'Cloud Sync & Session Library',
      badge: 'Integrated',
      color: 'var(--primary)',
      desc: 'Supabase PostgreSQL persistence with Row Level Security (RLS), instant full-text search, subject tag filters, session deletion, and automatic local storage fallback when offline.',
      action: () => onTryFeature('workspace')
    },
    {
      title: 'Screen-Off PWA & Document Export',
      badge: 'Active',
      color: 'var(--success)',
      desc: 'Installable Progressive Web App with Wake Lock + MediaSession background recording, OLED stealth battery-saver overlay, Microsoft Word (.doc) export, print-optimized PDF stylesheets, and deep-link sharing.',
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
          Powered by Next.js App Router, Groq Whisper Large V3 Turbo, Llama 3.3 70B high-throughput inference, and Supabase PostgreSQL.
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
