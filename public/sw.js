const CACHE_NAME = 'lecturescribe-pwa-v5';
const AUDIO_DB_NAME = 'LectureScribeAudioDB';
const AUDIO_DB_VERSION = 2;
const AUDIO_STORE = 'lecture_audio';
const CHECKPOINT_STORE = 'recording_checkpoints';
const SHARED_AUDIO_INBOX_KEY = 'shared_audio_inbox';

function openSharedInboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'noteId' });
      }
      if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        db.createObjectStore(CHECKPOINT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSharedAudioFromFormData(formData) {
  const audioFile = formData.get('audio');
  if (!audioFile) return false;

  const title = String(formData.get('title') || '').trim();
  const metaText = String(formData.get('meta') || '').trim();
  const arrayBuf = await audioFile.arrayBuffer();
  const blob = new Blob([arrayBuf], { type: audioFile.type || 'audio/mp4' });

  const db = await openSharedInboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHECKPOINT_STORE, 'readwrite');
    tx.objectStore(CHECKPOINT_STORE).put({
      id: SHARED_AUDIO_INBOX_KEY,
      blob,
      mimeType: blob.type || 'audio/mp4',
      fileName: audioFile.name || 'lecture.m4a',
      title,
      meta: metaText,
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
}
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle Web Share Target audio handoff from Android APK or external apps locally offline
  if (request.method === 'POST' && url.pathname === '/share-audio') {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          await saveSharedAudioFromFormData(formData);
        } catch (err) {
          console.warn('Share audio inbox error:', err);
        }
        return Response.redirect('/?sharedAudio=1', 303);
      })()
    );
    return;
  }

  // Always bypass cache for API routes, live audio streams, and other POST requests
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network first with cache fallback for pages and navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedReq = await caches.match(request);
        if (cachedReq) return cachedReq;
        return caches.match('/');
      })
    );
    return;
  }

  // Stale-while-revalidate for static files (chunks, icons, fonts)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
