'use client';

import { useState, useRef, useEffect } from 'react';
import {
  saveAudioForNote,
  saveRecordingCheckpoint,
  getRecordingCheckpoint,
  clearRecordingCheckpoint
} from '@/lib/audioStorage';
import { transcribeAudioWithChunking, polishTranscript, formatTimestamp } from '@/lib/audioUtils';
import { extractTextFromDocument } from '@/lib/docExtract';

// Tiny 1-second silent WAV base64 loop to keep mobile audio pipeline alive with screen off
const SILENT_AUDIO_DATA = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const SPEECH_RECOGNITION_LANGS = {
  en: 'en-US',
  auto: 'en-US',
  pcm: 'en-NG',
  ig: 'ig-NG',
  yo: 'yo-NG',
  fr: 'fr-FR',
  es: 'es-ES'
};

function configureMediaSession({ title, subject, onPause, onPlay, onStop }) {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Lecture Recording Active',
      artist: 'LectureScribe AI (Mic Active)',
      album: subject,
      artwork: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('pause', onPause);
    navigator.mediaSession.setActionHandler('play', onPlay);
    navigator.mediaSession.setActionHandler('stop', onStop);
  }
}

function setMediaSessionPlaybackState(state) {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state;
  }
}

export default function Recorder({ onSaveNote, initialLanguage = 'en', resetSignal = 0 }) {
  const [trackedResetSignal, setTrackedResetSignal] = useState(resetSignal);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [customSubject, setCustomSubject] = useState('');
  const [language, setLanguage] = useState(initialLanguage);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const [liveTranscript, setLiveTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [pendingCheckpoint, setPendingCheckpoint] = useState(null);

  const resolvedSubject = subject === '__custom__' ? (customSubject.trim() || 'Custom Course') : subject;

  // Mobile background & stealth screen-off state
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Audio capture & UI refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const accumulatedPausedDurationRef = useRef(0);
  const lastPauseTimestampRef = useRef(null);
  const lastCheckpointCountRef = useRef(0);
  const bookmarksRef = useRef([]);
  const metaRef = useRef({ title: '', subject: 'Computer Science', language: 'en', timerSeconds: 0 });
  const titleInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  // Background Audio Anchor & Wake Lock
  const silentAudioRef = useRef(null);
  const wakeLockRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Web speech fallback ref
  const speechRecognitionRef = useRef(null);
  const accumulatedWebSpeechRef = useRef('');

  // Keep latest metadata mirrored in ref for async/checkpoint handlers
  useEffect(() => {
    metaRef.current = { title, subject: resolvedSubject, language, timerSeconds };
  }, [title, resolvedSubject, language, timerSeconds]);

  // Check for interrupted unsaved recording checkpoint on mount
  useEffect(() => {
    getRecordingCheckpoint().then((cp) => {
      if (cp?.chunks?.length > 0) {
        setPendingCheckpoint(cp);
      }
    });
  }, []);

  // Reset form state when New Lecture is triggered
  if (resetSignal !== trackedResetSignal) {
    setTrackedResetSignal(resetSignal);
    if (!isRecording && !isProcessing) {
      setTitle('');
      setLiveTranscript('');
      setStatusMessage('');
      setTimerSeconds(0);
      setBookmarks([]);
      setShowPasteBox(false);
      setPastedText('');
    }
  }

  // Focus title input when New Lecture is triggered
  useEffect(() => {
    if (resetSignal > 0 && !isRecording && !isProcessing) {
      accumulatedWebSpeechRef.current = '';
      bookmarksRef.current = [];
      if (titleInputRef.current) {
        titleInputRef.current.focus();
      }
    }
  }, [resetSignal, isRecording, isProcessing]);

  // Keep screen wake lock updated if toggled
  useEffect(() => {
    const handleWakeLock = async () => {
      if (isRecording && keepScreenAwake && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (e) {
          console.warn('Wake Lock request:', e);
        }
      } else if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (e) {}
      }
    };
    handleWakeLock();
  }, [isRecording, keepScreenAwake]);

  // Recalculate true elapsed time & flush checkpoint when tab hides or resumes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isRecording) return;

      if (document.visibilityState === 'hidden' && audioChunksRef.current.length > 0) {
        saveRecordingCheckpoint({
          chunks: [...audioChunksRef.current],
          mimeType: mediaRecorderRef.current?.mimeType || 'audio/webm',
          title: metaRef.current.title,
          subject: metaRef.current.subject,
          language: metaRef.current.language,
          timerSeconds: metaRef.current.timerSeconds,
          bookmarks: bookmarksRef.current
        });
      }

      if (!isPaused && startTimeRef.current) {
        const trueElapsed = Math.floor(
          (Date.now() - startTimeRef.current - accumulatedPausedDurationRef.current) / 1000
        );
        if (trueElapsed >= 0) {
          setTimerSeconds(trueElapsed);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [isRecording, isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
      if (silentAudioRef.current) {
        try {
          silentAudioRef.current.pause();
          silentAudioRef.current = null;
        } catch (e) {}
      }
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch (e) {}
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  const formatTime = (totalSecs) => formatTimestamp(totalSecs);

  const stopBackgroundAudioAnchor = () => {
    if (silentAudioRef.current) {
      try {
        silentAudioRef.current.pause();
      } catch (e) {}
    }
    setMediaSessionPlaybackState('none');
  };

  // Shared AI note synthesis helper that surfaces API error details
  const synthesizeNotes = async (transcriptText, effectiveTitle) => {
    try {
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          title: effectiveTitle,
          subject: resolvedSubject
        })
      });

      if (analyzeRes.ok) {
        return { notesData: await analyzeRes.json(), error: '' };
      }

      let message = `Analysis failed (${analyzeRes.status}).`;
      try {
        const errData = await analyzeRes.json();
        if (errData?.error) message = errData.error;
      } catch {}
      return { notesData: null, error: message };
    } catch (err) {
      console.error('Analysis error:', err);
      return { notesData: null, error: err?.message || 'Network error during analysis.' };
    }
  };

  // Shared chunked transcription + AI note synthesis pipeline (with IndexedDB playback & offline queue)
  const processAudioAndCompile = async (
    audioBlobOrFile,
    uploadFileName,
    fallbackText,
    effectiveTitle,
    capturedBookmarks = []
  ) => {
    setIsProcessing(true);
    const noteId = 'lecture_' + Date.now();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    // Persist audio locally in IndexedDB for playback and offline resilience
    await saveAudioForNote(noteId, audioBlobOrFile, {
      fileName: uploadFileName,
      language,
      pendingSync: isOffline
    });

    let rawTranscript = '';
    let finalTranscript = '';
    let transcriptSegments = [];
    let pendingSync = isOffline;
    let transcribeError = '';

    if (!isOffline) {
      try {
        const result = await transcribeAudioWithChunking({
          blobOrFile: audioBlobOrFile,
          fileName: uploadFileName,
          language,
          onProgress: (msg) => setStatusMessage(msg)
        });
        rawTranscript = result.text;
        finalTranscript = result.text;
        transcriptSegments = result.segments;
        pendingSync = false;
        if (rawTranscript) {
          setLiveTranscript(rawTranscript);
        }
      } catch (err) {
        console.warn('Transcribe note:', err);
        transcribeError = err?.message || 'Transcription error';
        if (!err?.status || err.status >= 502) {
          pendingSync = true;
        }
      }
    }

    if (pendingSync) {
      await saveAudioForNote(noteId, audioBlobOrFile, {
        fileName: uploadFileName,
        language,
        pendingSync: true
      });
    }

    if (
      !pendingSync &&
      finalTranscript.trim().length > 0 &&
      !finalTranscript.includes('No speech detected')
    ) {
      const polished = await polishTranscript({
        text: finalTranscript,
        segments: transcriptSegments,
        title: effectiveTitle,
        subject: resolvedSubject,
        language,
        onProgress: (msg) => setStatusMessage(msg)
      });
      finalTranscript = polished.cleanedText || finalTranscript;
      if (polished.cleanedSegments.length > 0) {
        transcriptSegments = polished.cleanedSegments;
      }
    }

    if (!finalTranscript || finalTranscript.trim().length === 0) {
      finalTranscript = pendingSync
        ? fallbackText || `Saved offline: "${effectiveTitle}". Will sync when online.`
        : fallbackText ||
          `Recorded "${effectiveTitle}" (${resolvedSubject}). ${transcribeError ? `(${transcribeError})` : ''}`.trim();
    }

    setLiveTranscript(finalTranscript);

    let notesData = null;
    let analysisError = '';
    if (!pendingSync) {
      setStatusMessage('Generating notes...');
      const result = await synthesizeNotes(finalTranscript, effectiveTitle);
      notesData = result.notesData;
      analysisError = result.error;
    } else {
      notesData = {
        summary: 'Saved offline. Syncs automatically when online.',
        keyConcepts: [],
        outline: [],
        quizQuestions: []
      };
    }

    const newNote = {
      id: noteId,
      title: effectiveTitle,
      tag: resolvedSubject,
      language,
      hasLocalAudio: true,
      pendingSync,
      segments: transcriptSegments,
      bookmarks: capturedBookmarks,
      masteredIndices: [],
      timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      rawTranscript,
      transcript: finalTranscript,
      notes: notesData
    };

    onSaveNote(newNote);
    setIsProcessing(false);
    setBookmarks([]);
    bookmarksRef.current = [];
    setStatusMessage(
      pendingSync
        ? 'Saved offline — will sync when online'
        : analysisError
        ? `Saved (analysis error: ${analysisError})`
        : 'Saved'
    );
  };

  const handleRecoverCheckpoint = async () => {
    if (!pendingCheckpoint?.chunks?.length || isProcessing || isRecording) return;
    const cp = pendingCheckpoint;
    setPendingCheckpoint(null);
    await clearRecordingCheckpoint();

    if (cp.title) setTitle(cp.title);
    if (cp.language) setLanguage(cp.language);

    const mimeType = cp.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(cp.chunks, { type: mimeType });
    const recoveredTitle = (cp.title || '').trim() || `Recovered Lecture (${formatTimestamp(cp.timerSeconds)})`;
    await processAudioAndCompile(
      blob,
      `recovered.${fileExt}`,
      `Recovered recording (${formatTimestamp(cp.timerSeconds)}).`,
      recoveredTitle,
      cp.bookmarks || []
    );
  };

  const handleDiscardCheckpoint = async () => {
    setPendingCheckpoint(null);
    await clearRecordingCheckpoint();
  };

  const handleAddBookmark = () => {
    if (!isRecording) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20]);
    }
    const next = [...bookmarksRef.current, { timeSeconds: timerSeconds, label: 'Marked' }];
    bookmarksRef.current = next;
    setBookmarks(next);
    setStatusMessage(`Marked ${formatTimestamp(timerSeconds)}`);
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([30]);
    }

    if (isPaused) {
      mediaRecorderRef.current.resume();
      if (silentAudioRef.current) silentAudioRef.current.play().catch(() => {});
      setMediaSessionPlaybackState('playing');

      if (lastPauseTimestampRef.current) {
        accumulatedPausedDurationRef.current += (Date.now() - lastPauseTimestampRef.current);
        lastPauseTimestampRef.current = null;
      }

      setIsPaused(false);
      setStatusMessage('Resumed');
      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor(
            (Date.now() - startTimeRef.current - accumulatedPausedDurationRef.current) / 1000
          );
          setTimerSeconds(Math.max(0, elapsed));
        }
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      if (silentAudioRef.current) silentAudioRef.current.pause();
      setMediaSessionPlaybackState('paused');

      lastPauseTimestampRef.current = Date.now();
      setIsPaused(true);
      setStatusMessage('Paused');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }

    setIsStealthMode(false);
    stopBackgroundAudioAnchor();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
    }

    mediaRecorderRef.current.onstop = async () => {
      setIsRecording(false);
      setIsPaused(false);
      await clearRecordingCheckpoint();

      const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const effectiveTitle = title.trim() || `${resolvedSubject} Lecture`;
      const fallbackText =
        liveTranscript ||
        accumulatedWebSpeechRef.current ||
        'No speech detected.';

      await processAudioAndCompile(
        audioBlob,
        `lecture.${fileExt}`,
        fallbackText,
        effectiveTitle,
        bookmarksRef.current
      );
    };

    mediaRecorderRef.current.stop();
  };

  // Start Background Audio Anchor & MediaSession so mobile OS does not pause recording when screen is off
  const startBackgroundAudioAnchor = () => {
    try {
      if (!silentAudioRef.current) {
        const audio = new Audio(SILENT_AUDIO_DATA);
        audio.loop = true;
        audio.playsInline = true;
        silentAudioRef.current = audio;
      }
      silentAudioRef.current.play().catch(() => {});

      configureMediaSession({
        title: title.trim() || 'Lecture Recording Active',
        subject: resolvedSubject,
        onPause: () => togglePause(),
        onPlay: () => togglePause(),
        onStop: () => stopRecording()
      });
    } catch (e) {
      console.warn('Background audio setup note:', e);
    }
  };

  // Live audio level visualizer
  const setupAudioMeter = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn('Audio meter init note:', e);
    }
  };

  const initLiveSpeechPreview = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = SPEECH_RECOGNITION_LANGS[language] || 'en-US';

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

  const startRecording = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40]);
      }

      setStatusMessage('Allow mic access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Best supported audio MIME type across Android and iOS Safari
      let selectedMimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        const types = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/mp4',
          'audio/aac'
        ];
        for (const t of types) {
          if (MediaRecorder.isTypeSupported(t)) {
            selectedMimeType = t;
            break;
          }
        }
      }

      audioChunksRef.current = [];
      lastCheckpointCountRef.current = 0;
      bookmarksRef.current = [];
      setBookmarks([]);
      await clearRecordingCheckpoint();

      const recorderOptions = { audioBitsPerSecond: 32000 };
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
      }

      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
      } catch (e) {
        mediaRecorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream);
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Checkpoint chunks every 15 seconds so long classes survive browser restarts
          if (audioChunksRef.current.length - lastCheckpointCountRef.current >= 15) {
            lastCheckpointCountRef.current = audioChunksRef.current.length;
            saveRecordingCheckpoint({
              chunks: [...audioChunksRef.current],
              mimeType: mediaRecorder.mimeType || 'audio/webm',
              title: metaRef.current.title,
              subject: metaRef.current.subject,
              language: metaRef.current.language,
              timerSeconds: metaRef.current.timerSeconds,
              bookmarks: bookmarksRef.current
            });
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      // Emit chunks every 1000ms so data is never lost if screen turns off
      mediaRecorder.start(1000);

      // Start background keep-alive anchor
      startBackgroundAudioAnchor();
      setupAudioMeter(stream);
      initLiveSpeechPreview();

      setIsRecording(true);
      setIsPaused(false);
      setTimerSeconds(0);
      startTimeRef.current = Date.now();
      accumulatedPausedDurationRef.current = 0;
      lastPauseTimestampRef.current = null;
      setStatusMessage('Recording (safe to lock screen)');

      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor(
            (Date.now() - startTimeRef.current - accumulatedPausedDurationRef.current) / 1000
          );
          setTimerSeconds(Math.max(0, elapsed));
        }
      }, 1000);
    } catch (err) {
      console.error('Audio capture error:', err);
      setStatusMessage('Mic access denied.');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value so the same file can be selected again if needed
    event.target.value = '';

    const derivedTitle = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    const effectiveTitle = title.trim() || derivedTitle || `${resolvedSubject} Lecture`;
    if (!title.trim() && derivedTitle) {
      setTitle(derivedTitle);
    }

    await processAudioAndCompile(
      file,
      file.name,
      `Audio file: ${file.name} (${resolvedSubject}).`,
      effectiveTitle
    );
  };

  const handleDocumentImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setStatusMessage('Reading file...');
    try {
      const extracted = await extractTextFromDocument(file);
      const derivedTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (!title.trim() && derivedTitle) {
        setTitle(derivedTitle);
      }
      setPastedText((prev) => (prev.trim() ? `${prev.trim()}\n\n${extracted}` : extracted));
      setShowPasteBox(true);
      setStatusMessage(`Loaded ${file.name}`);
    } catch (err) {
      setStatusMessage(err?.message || 'Could not read document.');
    }
  };

  const handleCompilePastedText = async () => {
    const cleanText = pastedText.trim();
    if (!cleanText || isProcessing) return;

    const effectiveTitle = title.trim() || `${resolvedSubject} Lecture`;
    setIsProcessing(true);
    setLiveTranscript(cleanText);
    setStatusMessage('Generating notes...');

    const { notesData, error: analysisError } = await synthesizeNotes(cleanText, effectiveTitle);

    const newNote = {
      id: 'lecture_' + Date.now(),
      title: effectiveTitle,
      tag: resolvedSubject,
      masteredIndices: [],
      bookmarks: [],
      segments: [],
      timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      transcript: cleanText,
      notes: notesData
    };

    onSaveNote(newNote);
    setIsProcessing(false);
    setShowPasteBox(false);
    setPastedText('');
    setStatusMessage(analysisError ? `Saved (analysis error: ${analysisError})` : 'Saved');
  };

  return (
    <div className="no-print surface-card" style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      position: 'relative'
    }}>
      {pendingCheckpoint && !isRecording && !isProcessing && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid var(--warning)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.6rem'
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Unsaved recording ({formatTime(pendingCheckpoint.timerSeconds)})
          </span>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={handleRecoverCheckpoint}
              style={{
                padding: '0.38rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--warning)',
                color: '#0f172a',
                fontSize: '0.76rem',
                fontWeight: 700
              }}
            >
              Recover
            </button>
            <button
              type="button"
              onClick={handleDiscardCheckpoint}
              style={{
                padding: '0.38rem 0.7rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.76rem'
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {/* OLED / AMOLED Stealth Blackout Mode (Pure #000000 for 0% display battery use on phones) */}
      {isStealthMode && isRecording && (
        <div
          onDoubleClick={() => setIsStealthMode(false)}
          onTouchStart={(e) => {
            // Check double tap
            const now = Date.now();
            if (e.currentTarget.lastTap && (now - e.currentTarget.lastTap) < 350) {
              setIsStealthMode(false);
            }
            e.currentTarget.lastTap = now;
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#000000',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            touchAction: 'manipulation',
            userSelect: 'none'
          }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            opacity: 0.35,
            transition: 'opacity 0.2s ease'
          }}>
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: isPaused ? '#eab308' : '#ef4444',
              boxShadow: isPaused ? 'none' : '0 0 15px rgba(239, 68, 68, 0.8)'
            }} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '2rem',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.08em'
            }}>
              {formatTime(timerSeconds)}
            </div>
            <div style={{
              fontSize: '0.8rem',
              color: '#94a3b8',
              textAlign: 'center',
              lineHeight: 1.5,
              maxWidth: '260px'
            }}>
              Screen Off<br />
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Double-tap to wake</span>
            </div>
          </div>

          <button
            onClick={() => setIsStealthMode(false)}
            style={{
              position: 'absolute',
              bottom: '2.5rem',
              padding: '0.65rem 1.4rem',
              borderRadius: '9999px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: '1px solid #334155'
            }}
          >
            Exit
          </button>
        </div>
      )}

      {/* Top Metadata Row - Mobile Responsive Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.85rem'
      }} className="recorder-meta-grid">
        <div className="recorder-title-col" style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            TITLE
          </label>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Lecture title"
            disabled={isRecording}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.9rem',
              outline: 'none',
              color: 'var(--text-main)'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            SUBJECT
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
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
                outline: 'none',
                color: 'var(--text-main)'
              }}
            >
              <option value="Computer Science">Computer Science</option>
              <option value="Engineering">Engineering</option>
              <option value="Medicine & Health">Medicine & Health</option>
              <option value="Economics & Finance">Economics & Finance</option>
              <option value="Law & Governance">Law & Governance</option>
              <option value="General Studies">General Studies</option>
              <option value="__custom__">+ Custom...</option>
            </select>
            {subject === '__custom__' && (
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Course or tag"
                disabled={isRecording}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--primary)',
                  fontSize: '0.84rem',
                  outline: 'none',
                  color: 'var(--text-main)'
                }}
              />
            )}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            LANGUAGE
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
              outline: 'none',
              color: 'var(--text-main)'
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

      {/* Recording Display & Controls Card */}
      <div className="recorder-controls-row" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.1rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Left: Indicator & Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: isRecording ? (isPaused ? 'var(--warning)' : 'var(--danger)') : 'var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            transition: 'background-color 0.2s ease',
            flexShrink: 0
          }} className={isRecording && !isPaused ? 'pulsing-rec' : ''}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>

          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.65rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              lineHeight: 1.1
            }}>
              {formatTime(timerSeconds)}
            </div>
            <div style={{
              fontSize: '0.72rem',
              color: isRecording ? (isPaused ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: '0.2rem'
            }}>
              <span>{isRecording ? (isPaused ? 'PAUSED' : 'RECORDING') : 'READY'}</span>
              {isRecording && !isPaused && (
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--danger)'
                }} />
              )}
            </div>
          </div>
        </div>

        {/* Live Audio Level Meter */}
        {isRecording && !isPaused && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: '80px', maxWidth: '140px' }}>
            <div style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'var(--bg-app)',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${Math.max(10, audioLevel)}%`,
                backgroundColor: audioLevel > 70 ? 'var(--danger)' : 'var(--primary)',
                transition: 'width 0.1s ease'
              }} />
            </div>
          </div>
        )}

        {/* Action Buttons (Full mobile touch size) */}
        <div className="recorder-action-group" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.txt,.md,.csv"
            onChange={handleDocumentImport}
            style={{ display: 'none' }}
          />
          {!isRecording ? (
            <>
              <button
                type="button"
                onClick={() => setShowPasteBox(!showPasteBox)}
                disabled={isProcessing}
                title="Paste text or import PDF, Word, or PowerPoint"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.7rem 0.95rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: showPasteBox ? 'var(--primary)' : 'var(--bg-surface)',
                  border: '1px solid ' + (showPasteBox ? 'var(--primary)' : 'var(--border-subtle)'),
                  color: showPasteBox ? '#fff' : 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  opacity: isProcessing ? 0.6 : 1
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <span>Text / PDF</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                title="Upload audio file (MP3, WAV, M4A, WebM)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.7rem 0.95rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  opacity: isProcessing ? 0.6 : 1
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Upload</span>
              </button>

              <button
                onClick={startRecording}
                disabled={isProcessing}
                className="recorder-primary-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.55rem',
                  padding: '0.75rem 1.4rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--danger)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                  opacity: isProcessing ? 0.6 : 1
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8" />
                </svg>
                <span>Record</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAddBookmark}
                title="Bookmark current timestamp"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: bookmarks.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-surface)',
                  border: `1px solid ${bookmarks.length > 0 ? 'var(--warning)' : 'var(--border-subtle)'}`,
                  color: bookmarks.length > 0 ? 'var(--warning)' : 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '0.8rem'
                }}
              >
                <span>{bookmarks.length > 0 ? `Mark (${bookmarks.length})` : 'Mark'}</span>
              </button>

              {/* Screen Off / Stealth button for mobile battery saving */}
              <button
                onClick={() => setIsStealthMode(true)}
                title="Blackout screen while recording"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '0.8rem'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
                <span>Screen Off</span>
              </button>

              <button
                onClick={togglePause}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.65rem 1.05rem',
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
                className="recorder-primary-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.7rem 1.3rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                }}
              >
                Stop & Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Collapsible Paste Lecture Text / Slides Drawer */}
      {showPasteBox && !isRecording && (
        <div style={{
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-app)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Paste Text or Import File
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={isProcessing}
                style={{
                  padding: '0.32rem 0.7rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                Import PDF / DOCX / PPTX
              </button>
              <button
                type="button"
                onClick={() => setShowPasteBox(false)}
                style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
              >
                Close
              </button>
            </div>
          </div>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste notes, slides, or import PDF / DOCX / PPTX above..."
            rows={5}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              color: 'var(--text-main)',
              outline: 'none',
              resize: 'vertical'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleCompilePastedText}
              disabled={isProcessing || !pastedText.trim()}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                fontSize: '0.84rem',
                fontWeight: 600,
                opacity: isProcessing || !pastedText.trim() ? 0.6 : 1
              }}
            >
              {isProcessing ? 'Generating...' : 'Generate Notes'}
            </button>
          </div>
        </div>
      )}

      {/* Screen Off & Background Recording Notice */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 0.95rem',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--bg-app)',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.76rem',
        color: 'var(--text-secondary)',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
          <span>
            {isRecording
              ? 'Background active — safe to lock screen.'
              : 'Records even with screen locked.'}
          </span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={keepScreenAwake}
            onChange={(e) => setKeepScreenAwake(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Keep Awake</span>
        </label>
      </div>

      {/* Status Bar */}
      {(statusMessage || isProcessing) && (
        <div style={{
          fontSize: '0.82rem',
          color: isProcessing ? 'var(--primary)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.25rem 0.2rem'
        }}>
          {isProcessing && <div className="spinner" />}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Live Transcript Preview Box */}
      {(isRecording || liveTranscript) && (
        <div style={{
          backgroundColor: 'var(--bg-app)',
          padding: '0.9rem 1rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          maxHeight: '140px',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Live Transcript
          </div>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {liveTranscript || 'Listening...'}
          </p>
        </div>
      )}
    </div>
  );
}
