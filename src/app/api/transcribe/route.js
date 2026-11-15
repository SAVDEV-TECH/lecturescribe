import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// Supported ISO-639-1 language codes accepted by Groq Whisper Large V3 Turbo
const SUPPORTED_WHISPER_LANGS = new Set([
  'en', 'fr', 'es', 'yo', 'de', 'pt', 'ar', 'zh', 'hi', 'it', 'nl', 'ru', 'ja', 'ko'
]);

const DIALECT_PROMPTS = {
  pcm: 'University lecture transcript in Nigerian Pidgin English and standard English.',
  ig: 'University lecture transcript in Igbo and English.',
  yo: 'University lecture transcript in Yoruba and English.',
};

export async function POST(request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Groq API key not configured. Add GROQ_API_KEY to your .env.local file.' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const rawLanguage = (formData.get('language') || '').trim().toLowerCase();

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
    }

    const groq = new Groq({ apiKey });

    const whisperLanguage =
      rawLanguage && rawLanguage !== 'auto' && SUPPORTED_WHISPER_LANGS.has(rawLanguage)
        ? rawLanguage
        : undefined;

    const whisperPrompt =
      DIALECT_PROMPTS[rawLanguage] ||
      'Academic university lecture with technical terminology, clear punctuation, and structured explanations.';

    // Whisper Large V3 Turbo on Groq
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3-turbo',
      language: whisperLanguage,
      prompt: whisperPrompt,
      response_format: 'verbose_json',
      temperature: 0.0,
    });

    return NextResponse.json({
      text: transcription.text,
      language: transcription.language || rawLanguage || 'en',
      duration: transcription.duration,
      segments: transcription.segments || []
    });
  } catch (error) {
    console.error('Groq transcription error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to transcribe audio with Groq Whisper' },
      { status: 500 }
    );
  }
}
