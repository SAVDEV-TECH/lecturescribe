import { NextResponse } from 'next/server';
import { createChatCompletionWithFallback, parseModelJson } from '@/lib/groqClient';

const CLEANUP_RULES = `You clean up raw lecture recordings and distinguish classroom context:
- Remove filler words ("um", "uh", "erm", "like", "you know"), false starts, and repeated stutters.
- Resolve mid-sentence self-corrections so only the final intended wording stays (e.g., "Tuesday— wait no, Wednesday" becomes "Wednesday").
- Fix spoken grammar, awkward phrasing, punctuation, and capitalization so sentences read clearly and naturally.
- Keep exact meaning, names, numbers, and technical terms—do not invent new facts.

For each unit, classify:
- "speaker": "lecturer" (default) or "student" (ONLY when conversational cues clearly indicate a student asking a question, responding, or commenting—default to "lecturer" if uncertain).
- "category":
  * "lecture": core teaching, concepts, Q&A explanations, and humorous analogies that directly teach course concepts.
  * "aside": pure jokes, unrelated banter, laughter, mic checks, shushing/discipline, or personal tangents not tied to course material.
  * "logistics": assignment deadlines, exam dates, syllabus rules, or schedule announcements.`;

const VALID_SPEAKERS = new Set(['lecturer', 'student']);
const VALID_CATEGORIES = new Set(['lecture', 'aside', 'logistics']);

function normalizeSpeaker(value) {
  const s = String(value || '').trim().toLowerCase();
  return VALID_SPEAKERS.has(s) ? s : 'lecturer';
}

function normalizeCategory(value) {
  const c = String(value || '').trim().toLowerCase();
  return VALID_CATEGORIES.has(c) ? c : 'lecture';
}

/**
 * Lightweight local fallback cleanup when no GROQ_API_KEY is configured.
 */
function basicLocalPolish(text) {
  return String(text || '')
    .replace(/\b(um+|uh+|erm+|hmm+)\b[,\s]*/gi, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function POST(request) {
  try {
    const {
      text = '',
      segments = [],
      previousContext = '',
      title = 'Lecture',
      subject = 'General',
      language = 'en',
    } = await request.json();

    const hasSegments = Array.isArray(segments) && segments.length > 0;
    const rawText = String(text || '').trim();
    const priorHint = String(previousContext || '').trim().slice(-300);

    if (!hasSegments && !rawText) {
      return NextResponse.json({ error: 'Transcript text is required.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      if (hasSegments) {
        const cleanedSegs = segments
          .map((s) => ({
            start: typeof s?.start === 'number' ? s.start : null,
            end: typeof s?.end === 'number' ? s.end : null,
            text: basicLocalPolish(s?.text),
            speaker: normalizeSpeaker(s?.speaker),
            category: normalizeCategory(s?.category),
          }))
          .filter((s) => s.text.length > 0);
        return NextResponse.json({
          cleanedText: cleanedSegs.map((s) => s.text).join(' '),
          segments: cleanedSegs,
        });
      }
      return NextResponse.json({ cleanedText: basicLocalPolish(rawText), segments: [] });
    }

    if (hasSegments) {
      const indexedInput = segments.map((s, idx) => ({
        id: idx,
        text: String(s?.text || '').trim(),
      }));

      const { content } = await createChatCompletionWithFallback(apiKey, {
        messages: [
          {
            role: 'system',
            content: `${CLEANUP_RULES}
Target language hint: ${language}. Course: ${subject} (${title}).
${priorHint ? `Previous line for speaker/context continuity: "${priorHint}"` : ''}
Respond ONLY with valid JSON:
{"segments":[{"id":0,"text":"Cleaned text","speaker":"lecturer","category":"lecture"}]}
Return an entry for every input id. If a segment was purely redundant filler or replaced by a later self-correction, set its "text" to "".`,
          },
          {
            role: 'user',
            content: JSON.stringify({ segments: indexedInput }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const parsed = parseModelJson(content);
      const returnedMap = new Map();
      if (Array.isArray(parsed?.segments)) {
        for (const item of parsed.segments) {
          if (typeof item?.id === 'number' && typeof item?.text === 'string') {
            returnedMap.set(item.id, {
              text: item.text.trim(),
              speaker: normalizeSpeaker(item.speaker),
              category: normalizeCategory(item.category),
            });
          }
        }
      }

      const cleanedSegments = segments
        .map((seg, idx) => {
          const entry = returnedMap.get(idx);
          const polished = entry ? entry.text : String(seg?.text || '').trim();
          return {
            start: typeof seg?.start === 'number' ? seg.start : null,
            end: typeof seg?.end === 'number' ? seg.end : null,
            text: polished,
            speaker: entry ? entry.speaker : normalizeSpeaker(seg?.speaker),
            category: entry ? entry.category : normalizeCategory(seg?.category),
          };
        })
        .filter((seg) => seg.text.length > 0);

      const cleanedText = cleanedSegments.map((s) => s.text).join(' ').trim();
      return NextResponse.json({
        cleanedText: cleanedText || rawText,
        segments: cleanedSegments,
      });
    }

    const { content } = await createChatCompletionWithFallback(apiKey, {
      messages: [
        {
          role: 'system',
          content: `${CLEANUP_RULES}
Target language hint: ${language}. Course: ${subject} (${title}).
${priorHint ? `Previous line for speaker/context continuity: "${priorHint}"` : ''}
Split the cleaned transcript into logical turns/beats and classify each segment.
Respond ONLY with valid JSON matching:
{"cleanedText":"Full cleaned text","segments":[{"text":"Clean turn or paragraph","speaker":"lecturer","category":"lecture"}]}`,
        },
        {
          role: 'user',
          content: rawText.slice(0, 12000),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const parsed = parseModelJson(content);
    const untimedSegments = Array.isArray(parsed?.segments)
      ? parsed.segments
          .map((item) => ({
            start: null,
            end: null,
            text: String(item?.text || '').trim(),
            speaker: normalizeSpeaker(item?.speaker),
            category: normalizeCategory(item?.category),
          }))
          .filter((item) => item.text.length > 0)
      : [];

    const cleanedFromSegments = untimedSegments.map((s) => s.text).join(' ').trim();
    const cleanedText =
      (typeof parsed?.cleanedText === 'string' && parsed.cleanedText.trim()) ||
      cleanedFromSegments ||
      rawText;

    return NextResponse.json({ cleanedText, segments: untimedSegments });
  } catch (error) {
    console.error('Transcript cleanup error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to clean transcript' },
      { status: 500 }
    );
  }
}
