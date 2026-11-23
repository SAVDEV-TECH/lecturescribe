import { NextResponse } from 'next/server';
import { createChatCompletionWithFallback } from '@/lib/groqClient';

export async function POST(request) {
  try {
    const { messages = [], transcript = '', noteTitle = 'Lecture' } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'At least one message is required.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      // Fallback assistant response when no API key configured
      return NextResponse.json({
        reply: `Preview mode for "${noteTitle}". Add GROQ_API_KEY in .env.local for live Q&A.`
      });
    }

    const systemPrompt = `You are a concise lecture tutor for "${noteTitle}".
Base answers on this transcript:
"""
${transcript.slice(0, 12000)}
"""
Keep replies brief and scannable (2-4 short sentences or bullets unless asked for more). Note clearly if a topic is not in the transcript.`;

    const { content: reply } = await createChatCompletionWithFallback(apiKey, {
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      temperature: 0.4,
      max_tokens: 1024
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Groq tutor chat error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate tutor reply' },
      { status: 500 }
    );
  }
}
