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
        reply: `I am your Lecture AI Tutor for "${noteTitle}". Since a Groq API key hasn't been set in .env.local yet, I am running in preview mode. Set your free key to unlock instant contextual Q&A on this transcript!`
      });
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `You are a patient, encouraging academic tutor helping a university student understand their lecture on "${noteTitle}".
Base your answers primarily on the following lecture transcript:
"""
${transcript.slice(0, 12000)}
"""
Keep your explanations clear, structured, and easy to memorize for exams. If the question asks about something not mentioned in the transcript, mention that it was not covered in this lecture and provide helpful general context.`;

    const completion = await groq.chat.completions.create({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      temperature: 0.4,
      max_tokens: 800
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
