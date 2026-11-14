import './globals.css';

export const metadata = {
  title: 'LectureScribe AI — Smart Lecture Recording & Study Assistant',
  description: 'Real-time lecture speech transcription powered by Groq Whisper, automated AI note generation, interactive flashcards, and student AI tutor.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>{children}</body>
    </html>
  );
}
