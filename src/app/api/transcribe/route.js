import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

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
    const language = formData.get('language') || undefined;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
    }

    const groq = new Groq({ apiKey });

    // Whisper Large V3 Turbo on Groq
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3-turbo',
      language: language && language !== 'auto' ? language : undefined,
      response_format: 'verbose_json',
      temperature: 0.0,
    });

    return NextResponse.json({
      text: transcription.text,
      language: transcription.language,
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
