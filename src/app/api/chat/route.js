import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

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

    const groq = new Groq({ apiKey });

    const systemPrompt = `You are a concise lecture tutor for "${noteTitle}".
Base answers on this transcript:
"""
${transcript.slice(0, 12000)}
"""
Keep replies brief and scannable (2-4 short sentences or bullets unless asked for more). Note clearly if a topic is not in the transcript.`;

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      temperature: 0.4,
      max_tokens: 450
    });

    const reply = completion.choices[0].message.content;
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Groq tutor chat error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate tutor reply' },
      { status: 500 }
    );
  }
}
