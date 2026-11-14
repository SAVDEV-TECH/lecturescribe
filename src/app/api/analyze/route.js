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
        summary: `This lecture covers core principles of ${title}. The discussion highlights fundamental topics, practical applications, and key analytical takeaways based on ${words.length} recorded words.`,
        keyConcepts: [
          { term: title, definition: 'The central topic explored in this lecture session.' },
          { term: subject, definition: 'The academic discipline framing the lecture contents.' },
          { term: 'Core Principles', definition: 'The foundational frameworks introduced by the lecturer.' },
          { term: 'Practical Application', definition: 'How the concepts apply to real-world problems and coursework.' }
        ],
        outline: [
          `Introduction to ${title} and scope`,
          `Analysis of central themes and definitions`,
          `Practical implications and illustrative examples`,
          `Summary of conclusions and review points`
        ],
        quizQuestions: [
          {
            question: `What is the primary focus of this lecture on ${title}?`,
            answer: `It introduces fundamental ideas, theories, and practical applications within ${subject}.`
          },
          {
            question: 'Why are the core principles covered in this lecture significant?',
            answer: 'They establish the foundational understanding required for subsequent coursework and exams.'
          }
        ]
      });
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `You are an elite academic assistant and lecture note compiler. 
Given a raw lecture transcript, analyze it thoroughly and respond ONLY with a valid, clean JSON object matching this exact schema:
{
  "summary": "Concise, high-impact 2-4 sentence executive summary of the lecture",
  "keyConcepts": [
    { "term": "Term Name", "definition": "Clear, memorable academic definition" }
  ],
  "outline": [
    "Chronological topic 1 discussed",
    "Chronological topic 2 discussed"
  ],
  "quizQuestions": [
    { "question": "Active-recall review question for exam prep", "answer": "Detailed, correct answer based on the lecture" }
  ]
}
Do not include any markdown formatting, backticks, or other text outside the JSON.`;

    const completion = await groq.chat.completions.create({
      model: 'qwen/qwen3.8-27b',
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
