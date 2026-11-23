// IndexedDB helper for persistent lecture audio playback, offline queues, and live recording checkpoints

const DB_NAME = 'LectureScribeAudioDB';
const DB_VERSION = 2;
const AUDIO_STORE = 'lecture_audio';
const CHECKPOINT_STORE = 'recording_checkpoints';
const ACTIVE_CHECKPOINT_KEY = 'active_recording';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'noteId' });
      }
      if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        db.createObjectStore(CHECKPOINT_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runStoreRequest(storeName, mode, executor) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = executor(store);

    if (mode === 'readonly' && req) {
      req.onsuccess = () => {
        db.close();
        resolve(req.result ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
      return;
    }

    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function saveAudioForNote(noteId, blob, metadata = {}) {
  if (!noteId || !blob) return false;
  try {
    return await runStoreRequest(AUDIO_STORE, 'readwrite', (store) =>
      store.put({
        noteId: String(noteId),
        blob,
        mimeType: blob.type || metadata.mimeType || 'audio/webm',
        fileName: metadata.fileName || `lecture_${noteId}.webm`,
        language: metadata.language || 'en',
        pendingSync: Boolean(metadata.pendingSync),
        updatedAt: Date.now()
      })
    );
  } catch (err) {
    console.warn('IndexedDB saveAudioForNote note:', err);
    return false;
  }
}

export async function getAudioForNote(noteId) {
  if (!noteId) return null;
  try {
    return await runStoreRequest(AUDIO_STORE, 'readonly', (store) =>
      store.get(String(noteId))
    );
  } catch (err) {
    console.warn('IndexedDB getAudioForNote note:', err);
    return null;
  }
}

export async function deleteAudioForNote(noteId) {
  if (!noteId) return false;
  try {
    return await runStoreRequest(AUDIO_STORE, 'readwrite', (store) =>
      store.delete(String(noteId))
    );
  } catch (err) {
    console.warn('IndexedDB deleteAudioForNote note:', err);
    return false;
  }
}

/**
 * Persists in-progress recording chunks so tab termination or crash cannot lose audio.
 */
export async function saveRecordingCheckpoint(checkpoint) {
  if (!checkpoint?.chunks?.length) return false;
  try {
    return await runStoreRequest(CHECKPOINT_STORE, 'readwrite', (store) =>
      store.put({
        id: ACTIVE_CHECKPOINT_KEY,
        chunks: checkpoint.chunks,
        mimeType: checkpoint.mimeType || 'audio/webm',
        title: checkpoint.title || '',
        subject: checkpoint.subject || 'Computer Science',
        language: checkpoint.language || 'en',
        timerSeconds: checkpoint.timerSeconds || 0,
        bookmarks: Array.isArray(checkpoint.bookmarks) ? checkpoint.bookmarks : [],
        updatedAt: Date.now()
      })
    );
  } catch (err) {
    console.warn('IndexedDB saveRecordingCheckpoint note:', err);
    return false;
  }
}

export async function getRecordingCheckpoint() {
  try {
    return await runStoreRequest(CHECKPOINT_STORE, 'readonly', (store) =>
      store.get(ACTIVE_CHECKPOINT_KEY)
    );
  } catch (err) {
    console.warn('IndexedDB getRecordingCheckpoint note:', err);
    return null;
  }
}

export async function clearRecordingCheckpoint() {
  try {
    return await runStoreRequest(CHECKPOINT_STORE, 'readwrite', (store) =>
      store.delete(ACTIVE_CHECKPOINT_KEY)
    );
  } catch (err) {
    console.warn('IndexedDB clearRecordingCheckpoint note:', err);
    return false;
  }
}

const SHARED_AUDIO_INBOX_KEY = 'shared_audio_inbox';

/**
 * Reads an audio recording handed off from the Android native foreground service or Share Target.
 */
export async function getSharedAudioInbox() {
  try {
    return await runStoreRequest(CHECKPOINT_STORE, 'readonly', (store) =>
      store.get(SHARED_AUDIO_INBOX_KEY)
    );
  } catch (err) {
    console.warn('IndexedDB getSharedAudioInbox note:', err);
    return null;
  }
}

export async function clearSharedAudioInbox() {
  try {
    return await runStoreRequest(CHECKPOINT_STORE, 'readwrite', (store) =>
      store.delete(SHARED_AUDIO_INBOX_KEY)
    );
  } catch (err) {
    console.warn('IndexedDB clearSharedAudioInbox note:', err);
    return false;
  }
}
