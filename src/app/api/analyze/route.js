import { NextResponse } from 'next/server';
import { createChatCompletionWithFallback, parseModelJson } from '@/lib/groqClient';
import { buildStudyTranscriptFromSegments } from '@/lib/noteMeta';

export async function POST(request) {
  try {
    const {
      transcript = '',
      segments = [],
      title = 'Lecture',
      subject = 'General'
    } = await request.json();

    const studyInput = buildStudyTranscriptFromSegments(segments, transcript);

    if (!studyInput || studyInput.trim().length === 0) {
      return NextResponse.json({ error: 'Transcript is required for analysis.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      // Fallback generator when running without an API key yet
      const words = studyInput.split(/\s+/).filter(Boolean);
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

    const systemPrompt = `You are a concise lecture note compiler.
Analyze the classroom transcript and respond ONLY with valid JSON matching this schema, keeping every text field brief and scannable (no filler):
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
Classroom rules:
- Ignore jokes, personal banter, mic checks, off-topic chatter, and any [Aside] remarks completely unless a joke directly serves as a technical teaching analogy.
- Distinguish [Student] questions/comments from [Lecturer] explanations: never state a student's wrong or uncertain guess as an academic fact; summarize only verified concepts taught or confirmed by the lecturer.
Generate 3 to 4 quizQuestions with 4 concise options each and correctIndex (0-3). Keep outline to 3-5 short bullets. No markdown or text outside JSON.`;

    const { content } = await createChatCompletionWithFallback(apiKey, {
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Course: ${subject}\nLecture Title: ${title}\n\nTranscript:\n${studyInput.slice(0, 24000)}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    const parsed = parseModelJson(content);
    return NextResponse.json({
      summary: typeof parsed?.summary === 'string' ? parsed.summary : '',
      keyConcepts: Array.isArray(parsed?.keyConcepts) ? parsed.keyConcepts : [],
      outline: Array.isArray(parsed?.outline) ? parsed.outline : [],
      quizQuestions: Array.isArray(parsed?.quizQuestions) ? parsed.quizQuestions : [],
    });
  } catch (error) {
    console.error('Groq analysis error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to analyze lecture' },
      { status: 500 }
    );
  }
}
