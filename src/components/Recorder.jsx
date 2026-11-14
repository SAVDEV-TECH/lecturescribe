'use client';

import { useState, useRef, useEffect } from 'react';

export default function Recorder({ onSaveNote, initialLanguage = 'en' }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [language, setLanguage] = useState(initialLanguage);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const [liveTranscript, setLiveTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Audio capture refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  // Web speech fallback ref
  const speechRecognitionRef = useRef(null);
  const accumulatedWebSpeechRef = useRef('');

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const formatTime = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      setStatusMessage('Requesting audio input...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      initLiveSpeechPreview();

      setIsRecording(true);
      setIsPaused(false);
      setTimerSeconds(0);
      setStatusMessage('Audio stream active');

      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio capture error:', err);
      setStatusMessage('Microphone access denied. Please grant permission in browser settings.');
    }
  };

  const initLiveSpeechPreview = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'auto' ? 'en-US' : language;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            accumulatedWebSpeechRef.current += ' ' + event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setLiveTranscript((accumulatedWebSpeechRef.current + ' ' + interim).trim());
      };

      recognition.onerror = (e) => {
        console.warn('Speech engine:', e.error);
      };

      recognition.onend = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (e) {
      console.warn('Speech preview init note:', e);
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      setStatusMessage('Audio stream resumed');
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      setStatusMessage('Audio stream paused');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
    }

    mediaRecorderRef.current.onstop = async () => {
      setIsRecording(false);
      setIsPaused(false);
      setIsProcessing(true);
      setStatusMessage('Transcribing audio recording...');

      const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      let finalTranscript = '';

      try {
        const formData = new FormData();
        const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
        formData.append('file', audioBlob, `lecture.${fileExt}`);
        formData.append('language', language);

        const transcribeRes = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });

        if (transcribeRes.ok) {
          const data = await transcribeRes.json();
          finalTranscript = data.text;
        } else {
          const errData = await transcribeRes.json();
          console.warn('Transcribe note:', errData.error);
        }
      } catch (err) {
        console.warn('Transcribe network error:', err);
      }

      if (!finalTranscript || finalTranscript.trim().length === 0) {
        finalTranscript = liveTranscript || accumulatedWebSpeechRef.current || 
          'Recorded session. Audio stream was silent or no speech was detected.';
      }

      setLiveTranscript(finalTranscript);
      setStatusMessage('Generating structured notes and outline...');

      let notesData = null;
      try {
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: finalTranscript,
            title: title.trim() || 'Untitled Lecture',
            subject: subject
          })
        });

        if (analyzeRes.ok) {
          notesData = await analyzeRes.json();
        }
      } catch (err) {
        console.error('Analysis error:', err);
      }

      const newNote = {
        id: 'lecture_' + Date.now(),
        title: title.trim() || 'Lecture on ' + subject,
        tag: subject,
        timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        transcript: finalTranscript,
        notes: notesData
      };

      onSaveNote(newNote);
      setIsProcessing(false);
      setStatusMessage('Session saved successfully');
    };

    mediaRecorderRef.current.stop();
  };

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      {/* Top Metadata Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }} className="recorder-meta-grid">
        <div>
          <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            SESSION TITLE
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Distributed Systems: Consensus Protocols"
            disabled={isRecording}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            SUBJECT
          </label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isRecording}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          >
            <option value="Computer Science">Computer Science</option>
            <option value="Engineering">Engineering</option>
            <option value="Medicine & Health">Medicine & Health</option>
            <option value="Economics & Finance">Economics & Finance</option>
            <option value="Law & Governance">Law & Governance</option>
            <option value="General Studies">General Studies</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            LANGUAGE LOCALE
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={isRecording}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          >
            <option value="en">English</option>
            <option value="auto">Auto-Detect</option>
            <option value="pcm">Nigerian Pidgin</option>
            <option value="ig">Igbo</option>
            <option value="yo">Yoruba</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
          </select>
        </div>
      </div>

      {/* Recording Display & Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.25rem 1.5rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: isRecording ? (isPaused ? 'var(--warning)' : 'var(--danger)') : 'var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            transition: 'background-color 0.2s ease'
          }} className={isRecording && !isPaused ? 'pulsing-rec' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>

          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.45rem', fontWeight: 700, letterSpacing: '0.04em' }}>
              {formatTime(timerSeconds)}
            </div>
            <div style={{ fontSize: '0.74rem', color: isRecording ? (isPaused ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)', fontWeight: 600 }}>
              {isRecording ? (isPaused ? 'PAUSED' : 'RECORDING') : 'STANDBY'}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.4rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--danger)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.88rem',
              }}
            >
              Start Recording
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                style={{
                  padding: '0.65rem 1.1rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '0.84rem'
                }}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <button
                onClick={stopRecording}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.3rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                }}
              >
                Complete & Summarize
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Bar */}
      {(statusMessage || isProcessing) && (
        <div style={{
          fontSize: '0.82rem',
          color: isProcessing ? 'var(--primary)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.2rem'
        }}>
          {isProcessing && <div className="spinner" />}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Live Transcript Preview Box */}
      {(isRecording || liveTranscript) && (
        <div style={{
          backgroundColor: 'var(--bg-app)',
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          maxHeight: '150px',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Live Speech Feed:
          </div>
          <p style={{ fontSize: '0.86rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {liveTranscript || 'Listening for speech input...'}
          </p>
        </div>
      )}
    </div>
  );
}
