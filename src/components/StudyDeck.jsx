'use client';

import { useState } from 'react';

export default function StudyDeck({ note }) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Assistant state
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: `Welcome. I am ready to answer questions about "${note?.title || 'this session'}", generate practice prompts, or clarify terminology.`
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!note) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Select a session to access review flashcards and the lecture assistant.
      </div>
    );
  }

  // Build flashcards from key concepts & quiz questions
  const flashcards = [];
  if (note.notes?.keyConcepts) {
    note.notes.keyConcepts.forEach(item => {
      flashcards.push({
        type: 'Key Definition',
        front: item.term,
        back: item.definition
      });
    });
  }
  if (note.notes?.quizQuestions) {
    note.notes.quizQuestions.forEach(item => {
      flashcards.push({
        type: 'Review Question',
        front: item.question,
        back: item.answer
      });
    });
  }

  if (flashcards.length === 0) {
    flashcards.push({
      type: 'Overview',
      front: note.title,
      back: note.notes?.summary || 'General overview of the session.'
    });
  }

  const currentCard = flashcards[currentCardIndex % flashcards.length];

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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          transcript: note.transcript,
          noteTitle: note.title
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...newMessages, { sender: 'assistant', text: data.reply }]);
      } else {
        setMessages([...newMessages, { sender: 'assistant', text: 'Unable to connect to assistant service. Please check network connection.' }]);
      }
    } catch (e) {
      setMessages([...newMessages, { sender: 'assistant', text: 'Error dispatching message.' }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }} className="study-grid">
      {/* LEFT: Flashcards */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '440px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Review Flashcards</h2>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Click card to reveal definition or answer</p>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {currentCardIndex + 1} / {flashcards.length}
            </span>
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
                  marginBottom: '1rem'
                }}>
                  {currentCard.type}
                </span>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.4, color: 'var(--text-main)', textAlign: 'center' }}>
                  {currentCard.front}
                </div>
                <div style={{ marginTop: '1.5rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Click to reveal answer
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
                  marginBottom: '1rem'
                }}>
                  Answer & Explanation
                </span>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-main)', textAlign: 'center' }}>
                  {currentCard.back}
                </div>
                <div style={{ marginTop: '1.5rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Click to flip back
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem' }}>
          <button
            onClick={prevCard}
            style={{
              padding: '0.6rem 1.15rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.84rem',
              fontWeight: 500,
              color: 'var(--text-main)'
            }}
          >
            Previous
          </button>

          <button
            onClick={() => setIsFlipped(!isFlipped)}
            style={{
              padding: '0.6rem 1.15rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.84rem',
              fontWeight: 500,
              color: 'var(--primary)'
            }}
          >
            Flip Card
          </button>

          <button
            onClick={nextCard}
            style={{
              padding: '0.6rem 1.15rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              fontSize: '0.84rem',
              fontWeight: 600
            }}
          >
            Next
          </button>
        </div>
      </div>

      {/* RIGHT: Assistant Chat */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        height: '520px'
      }}>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.85rem', marginBottom: '0.85rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            Lecture Assistant
          </h2>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Ask questions regarding topics covered in this session
          </p>
        </div>

        {/* Quick prompt pills */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          {[
            'Summarize in three points',
            'Generate a practice question',
            'Clarify core concepts'
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
              <div className="spinner" /> Processing request...
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
            placeholder="Type a question about this session..."
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
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
