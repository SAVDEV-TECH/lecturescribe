import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(request) {
  try {
    const { transcript, title = 'Lecture', subject = 'General' } = await request.json();

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json({ error: 'Transcript is required for analysis.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      // Fallback generator when running without an API key yet
      const words = transcript.split(/\s+/).filter(Boolean);
      return NextResponse.json({
        summary: `Covers core concepts of ${title} (${words.length} recorded words).`,
        keyConcepts: [
          { term: title, definition: 'Main lecture topic.' },
          { term: subject, definition: 'Subject area.' },
          { term: 'Core Principles', definition: 'Key frameworks covered in the lecture.' }
        ],
        outline: [
          `Introduction to ${title}`,
          'Key terms and examples',
          'Takeaways'
        ],
        quizQuestions: [
          {
            question: `What is the main focus of ${title}?`,
            answer: `Core concepts and applications in ${subject}.`,
            options: [
              `Core concepts and applications in ${subject}.`,
              'Syllabus grading rules only.',
              'Unrelated historical events.',
              'Lab equipment maintenance.'
            ],
            correctIndex: 0
          },
          {
            question: 'Why are these core principles important?',
            answer: 'They form the foundation for later coursework and exams.',
            options: [
              'They are never tested.',
              'They form the foundation for later coursework and exams.',
              'They replace all lab sessions.',
              'They apply only to research.'
            ],
            correctIndex: 1
          }
        ]
      });
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `You are a concise lecture note compiler.
Analyze the transcript and respond ONLY with valid JSON matching this schema, keeping every text field brief and scannable (no filler):
{
  "summary": "Brief 1-2 sentence summary (under 35 words)",
  "keyConcepts": [
    { "term": "Term", "definition": "Short 1-sentence definition (under 15 words)" }
  ],
  "outline": [
    "Short 5-8 word bullet"
  ],
  "quizQuestions": [
    {
      "question": "Short review question",
      "answer": "Concise 1-sentence answer",
      "options": [
        "Concise option A",
        "Concise option B",
        "Concise option C",
        "Concise option D"
      ],
      "correctIndex": 0
    }
  ]
}
Generate 3 to 4 quizQuestions with 4 concise options each and correctIndex (0-3). Keep outline to 3-5 short bullets. No markdown or text outside JSON.`;

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Course: ${subject}\nLecture Title: ${title}\n\nTranscript:\n${transcript}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Groq analysis error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to analyze lecture' },
      { status: 500 }
    );
  }
}
