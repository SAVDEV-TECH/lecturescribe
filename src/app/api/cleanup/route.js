import { NextResponse } from 'next/server';
import { createChatCompletionWithFallback, parseModelJson } from '@/lib/groqClient';

const CLEANUP_RULES = `You clean up raw voice recordings after the user stops speaking:
- Remove filler words ("um", "uh", "erm", "like", "you know"), false starts, and repeated stutters.
- Resolve mid-sentence self-corrections so only the final intended wording stays (e.g., "Tuesday— wait no, Wednesday" becomes "Wednesday").
- Fix spoken grammar, awkward phrasing, punctuation, and capitalization so sentences read clearly and naturally.
- Keep the speaker's exact meaning, facts, names, numbers, and technical terms—do not invent new ideas.`;

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
      title = 'Lecture',
      subject = 'General',
      language = 'en',
    } = await request.json();

    const hasSegments = Array.isArray(segments) && segments.length > 0;
    const rawText = String(text || '').trim();

    if (!hasSegments && !rawText) {
      return NextResponse.json({ error: 'Transcript text is required.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      if (hasSegments) {
        const cleanedSegs = segments
          .map((s) => ({ ...s, text: basicLocalPolish(s.text) }))
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
Respond ONLY with valid JSON:
{"segments":[{"id":0,"text":"Cleaned text"}]}
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
            returnedMap.set(item.id, item.text.trim());
          }
        }
      }

      const cleanedSegments = segments
        .map((seg, idx) => {
          const polished = returnedMap.has(idx) ? returnedMap.get(idx) : String(seg?.text || '').trim();
          return {
            start: seg.start,
            end: seg.end,
            text: polished,
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
Respond ONLY with valid JSON matching: {"cleanedText":"..."}.`,
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
    const cleanedText = typeof parsed?.cleanedText === 'string' && parsed.cleanedText.trim()
      ? parsed.cleanedText.trim()
      : rawText;

    return NextResponse.json({ cleanedText, segments: [] });
  } catch (error) {
    console.error('Transcript cleanup error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to clean transcript' },
      { status: 500 }
    );
  }
}
