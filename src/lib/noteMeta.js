// Shared helpers for packing metadata into Supabase notes_json and exporting study formats

import { formatTimestamp } from './audioUtils.js';

const VALID_SPEAKERS = new Set(['lecturer', 'student']);
const VALID_CATEGORIES = new Set(['lecture', 'aside', 'logistics']);

export function normalizeTranscriptSegments(segments = []) {
  if (!Array.isArray(segments)) return [];
  return segments
    .filter((seg) => seg && String(seg.text || '').trim().length > 0)
    .map((seg) => {
      const startNum = typeof seg.start === 'number' && Number.isFinite(seg.start) ? seg.start : null;
      const endNum = typeof seg.end === 'number' && Number.isFinite(seg.end) ? seg.end : null;
      const rawSpeaker = String(seg.speaker || '').toLowerCase();
      const rawCategory = String(seg.category || '').toLowerCase();
      return {
        start: startNum,
        end: endNum,
        text: String(seg.text || '').trim(),
        speaker: VALID_SPEAKERS.has(rawSpeaker) ? rawSpeaker : 'lecturer',
        category: VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'lecture'
      };
    });
}

/**
 * Formats transcript segments for note synthesis, omitting non-educational banter ("aside")
 * and explicitly distinguishing student questions/guesses from lecturer explanations.
 */
export function buildStudyTranscriptFromSegments(segments = [], fallbackTranscript = '') {
  const normalized = normalizeTranscriptSegments(segments);
  const fallback = String(fallbackTranscript || '').trim();
  if (normalized.length === 0) {
    return fallback;
  }

  const substantive = normalized.filter((seg) => seg.category !== 'aside');
  const activeList = substantive.length > 0 ? substantive : normalized;
  const hasStudent = activeList.some((seg) => seg.speaker === 'student');

  return activeList
    .map((seg) => {
      const tags = [];
      if (hasStudent || seg.speaker === 'student') {
        tags.push(seg.speaker === 'student' ? 'Student' : 'Lecturer');
      }
      if (seg.category === 'logistics') {
        tags.push('Logistics');
      } else if (seg.category === 'aside') {
        tags.push('Aside');
      }
      return tags.length > 0 ? `[${tags.join(' · ')}]: ${seg.text}` : seg.text;
    })
    .join('\n')
    .trim() || fallback;
}

/**
 * Unpacks UI/study metadata stored inside notes_json._meta so existing
 * Supabase rows require zero SQL schema changes.
 */
export function unpackSupabaseNote(row) {
  const rawNotes = row.notes_json || {};
  const meta = rawNotes._meta || {};
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    starred: Boolean(meta.starred),
    segments: Array.isArray(meta.segments) ? normalizeTranscriptSegments(meta.segments) : [],
    bookmarks: Array.isArray(meta.bookmarks) ? meta.bookmarks : [],
    masteredIndices: Array.isArray(meta.masteredIndices) ? meta.masteredIndices : [],
    language: meta.language || 'en',
    rawTranscript: meta.rawTranscript || '',
    timestamp: new Date(row.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    transcript: row.transcript,
    notes: rawNotes
  };
}

/**
 * Packs local note fields cleanly into Supabase notes_json without altering schema columns.
 */
export function packNotesJsonForSupabase(note) {
  const baseNotes = { ...(note.notes || {}) };
  baseNotes._meta = {
    starred: Boolean(note.starred),
    segments: Array.isArray(note.segments) ? normalizeTranscriptSegments(note.segments) : [],
    bookmarks: Array.isArray(note.bookmarks) ? note.bookmarks : [],
    masteredIndices: Array.isArray(note.masteredIndices) ? note.masteredIndices : [],
    language: note.language || 'en',
    rawTranscript: note.rawTranscript || ''
  };
  return baseNotes;
}

export function buildMarkdownExport(note) {
  const lines = [
    `# ${note.title || 'Lecture Notes'}`,
    `*${note.tag || 'General'} · ${note.timestamp || ''}*`,
    '',
    '## Summary',
    note.notes?.summary || 'No summary yet.',
  ];

  if (note.bookmarks?.length) {
    lines.push('', '## Marked Moments');
    note.bookmarks.forEach((b) => {
      lines.push(`- **${formatTimestamp(b.timeSeconds)}** ${b.label || 'Important'}`);
    });
  }

  if (note.notes?.keyConcepts?.length) {
    lines.push('', '## Key Terms');
    note.notes.keyConcepts.forEach((c) => {
      lines.push(`- **${c.term}**: ${c.definition}`);
    });
  }

  if (note.notes?.outline?.length) {
    lines.push('', '## Outline');
    note.notes.outline.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  }

  if (note.notes?.quizQuestions?.length) {
    lines.push('', '## Quiz');
    note.notes.quizQuestions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.question}**\n   Answer: ${q.answer}`);
    });
  }

  const normalizedSegments = normalizeTranscriptSegments(note.segments);
  if (normalizedSegments.length > 0) {
    const hasStudent = normalizedSegments.some((seg) => seg.speaker === 'student');
    const transcriptLines = normalizedSegments.map((seg) => {
      const timePrefix = typeof seg.start === 'number' ? `[${formatTimestamp(seg.start)}] ` : '';
      const speakerLabel = hasStudent || seg.speaker === 'student'
        ? `${seg.speaker === 'student' ? 'Student' : 'Lecturer'}: `
        : '';
      if (seg.category === 'aside') {
        return `*${timePrefix}Aside — ${speakerLabel}${seg.text}*`;
      }
      if (seg.category === 'logistics') {
        return `> ${timePrefix}**Logistics — ${speakerLabel}**${seg.text}`;
      }
      return speakerLabel ? `${timePrefix}**${speakerLabel}**${seg.text}` : `${timePrefix}${seg.text}`;
    });
    lines.push('', '## Transcript', ...transcriptLines);
  } else {
    lines.push('', '## Transcript', note.transcript || '');
  }
  return lines.join('\n');
}

function escapeCsvCell(value) {
  const s = String(value ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

export function buildAnkiCsvExport(note) {
  const rows = [];
  (note.notes?.keyConcepts || []).forEach((c) => {
    rows.push(`${escapeCsvCell(c.term)},${escapeCsvCell(c.definition)}`);
  });
  (note.notes?.quizQuestions || []).forEach((q) => {
    rows.push(`${escapeCsvCell(q.question)},${escapeCsvCell(q.answer)}`);
  });
  return rows.join('\n');
}

export function buildFlashcardsFromNotes(notesList = []) {
  const cards = [];
  notesList.forEach((n) => {
    const prefix = notesList.length > 1 && n?.title ? `${n.title} · ` : '';
    if (n?.notes?.keyConcepts) {
      n.notes.keyConcepts.forEach((item) => {
        cards.push({
          type: `${prefix}Term`,
          front: item.term,
          back: item.definition
        });
      });
    }
    if (n?.notes?.quizQuestions) {
      n.notes.quizQuestions.forEach((item) => {
        cards.push({
          type: `${prefix}Question`,
          front: item.question,
          back: item.answer
        });
      });
    }
  });
  return cards;
}
