# LectureScribe AI

**LectureScribe AI** is a mobile-first Progressive Web App (PWA) and Android Trusted Web Activity (TWA) for recording university lectures, transcribing speech with **Groq Whisper Large V3 Turbo**, synthesizing structured study notes, generating interactive active-recall flashcards, and chatting with a grounded AI Lecture Tutor.

---

## ✨ Key Capabilities

1. **Mobile-First Audio Recorder & Background Pipeline**
   - **Live Microphone Capture & Audio File Upload**: Record live in class (`webm/opus`, `mp4/aac`) with a real-time audio level meter and live browser speech preview, or upload pre-recorded audio files (`.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`).
   - **Screen-Off & Lock-Screen Persistence**: Uses a silent audio loop anchor and the `MediaSession` API so recording continues uninterrupted when the phone display is locked, with Play/Pause/Stop controls right on the lock screen.
   - **OLED Stealth Blackout Mode**: Full-screen `#000000` display overlay to save battery in dim lecture halls (double-tap anywhere to wake).
   - **Multi-Language & Dialect Support**: Supports English (`en`), Auto-Detect, Nigerian Pidgin (`pcm`), Igbo (`ig`), Yoruba (`yo`), French (`fr`), and Spanish (`es`) with automatic dialect hints for Whisper.

2. **Groq AI Speech & Synthesis Pipeline**
   - **Transcription (`/api/transcribe`)**: Powered by `whisper-large-v3-turbo` on Groq for near-instant transcription.
   - **Note Synthesis (`/api/analyze`)**: Uses `qwen/qwen3.8-27b` in structured JSON mode to compile an **Executive Summary**, **Key Terminology & Definitions**, **Chronological Session Outline**, and **Exam Review Questions** (with an automatic local fallback when running without an API key).
   - **Contextual AI Tutor (`/api/chat`)**: Interactive study assistant grounded in the active lecture's transcript.

3. **Study Deck, Note Management & Exporting**
   - **3D Active-Recall Flashcards**: Automatically builds flip cards from key terminology and review prompts.
   - **Full Session Management**: Search and filter sessions by title or subject tag, inline-rename or edit notes, and delete sessions across both local storage and Supabase cloud sync.
   - **One-Click Export & Share**: Export formatted Microsoft Word (`.doc`) documents, print/save clean PDFs, or copy structured study notes to the clipboard.

4. **Cloud Sync & Offline Guest Fallback**
   - **Supabase Auth & PostgreSQL**: Supports Email/Password, Google OAuth, and Google One Tap sign-in with Row-Level Security (RLS).
   - **Automatic Guest Mode**: Works out-of-the-box using `localStorage` when offline or unauthenticated.

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:
- `GROQ_API_KEY`: Your Groq API key from [console.groq.com](https://console.groq.com/keys).
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`: *(Optional)* Your Supabase project URL and anon key.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: *(Optional)* Google OAuth client ID for Google One Tap sign-in.

> **Note:** If `GROQ_API_KEY` or Supabase variables are omitted, LectureScribe automatically runs in preview/local guest mode so you can test the entire UI immediately.

### 3. Database Setup (Optional — for Cloud Sync)

If using Supabase, open the **SQL Editor** in your Supabase dashboard and run [`supabase/schema.sql`](./supabase/schema.sql) to create the `public.notes` table and its Row-Level Security (RLS) policies.

### 4. Run the Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 📁 Project Structure

```text
├── public/
│   ├── .well-known/assetlinks.json  # Android TWA Digital Asset Links
│   ├── manifest.json                # PWA Web App Manifest & shortcuts
│   └── sw.js                        # Offline-capable Service Worker
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.js     # Structured note synthesis endpoint
│   │   │   ├── chat/route.js        # Contextual AI tutor endpoint
│   │   │   └── transcribe/route.js  # Whisper Large V3 Turbo endpoint
│   │   ├── globals.css              # Design tokens, dark/light themes, 3D flip cards
│   │   ├── layout.js                # Root layout & PWA metadata
│   │   └── page.js                  # Main application state & cloud/local sync
│   ├── components/
│   │   ├── AuthModal.jsx            # Supabase Email + Google OAuth / One Tap modal
│   │   ├── Header.jsx               # Top navigation bar & theme switcher
│   │   ├── MobileBottomNav.jsx      # Responsive mobile bottom navigation
│   │   ├── NotesPane.jsx            # Note viewer, inline editor, Word/PDF export & share
│   │   ├── PwaRegister.jsx          # Service worker registration & install banner
│   │   ├── Recorder.jsx             # Mic recorder, audio file upload, stealth mode & wake lock
│   │   ├── RoadmapPanel.jsx         # System capabilities & architecture overview
│   │   ├── Sidebar.jsx              # Session list, search/tag filter, rename & delete
│   │   └── StudyDeck.jsx            # 3D flashcards & AI Lecture Tutor chat
│   └── lib/
│       ├── mockData.js              # Initial seed lecture note
│       └── supabase.js              # Supabase client helper
└── supabase/
    └── schema.sql                   # PostgreSQL table & RLS policy definitions
```
