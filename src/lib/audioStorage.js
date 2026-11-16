// Lightweight IndexedDB helper for storing lecture audio recordings locally
// Powers both the Audio Playback Player in NotesPane and the Offline Recording Queue

const DB_NAME = 'LectureScribeAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'lecture_audio';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'noteId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioForNote(noteId, blob, metadata = {}) {
  if (!noteId || !blob) return false;
  try {
    const db = await openAudioDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        noteId: String(noteId),
        blob,
        mimeType: blob.type || 'audio/webm',
        fileName: metadata.fileName || `lecture_${noteId}.webm`,
        language: metadata.language || 'en',
        pendingSync: Boolean(metadata.pendingSync),
        updatedAt: Date.now()
      });
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB saveAudioForNote note:', err);
    return false;
  }
}

export async function getAudioForNote(noteId) {
  if (!noteId) return null;
  try {
    const db = await openAudioDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(String(noteId));
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB getAudioForNote note:', err);
    return null;
  }
}

export async function deleteAudioForNote(noteId) {
  if (!noteId) return false;
  try {
    const db = await openAudioDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(String(noteId));
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('IndexedDB deleteAudioForNote note:', err);
    return false;
  }
}
