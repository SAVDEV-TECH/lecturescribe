// Shared helpers for packing metadata into Supabase notes_json and exporting study formats

import { formatTimestamp } from './audioUtils.js';

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
    segments: Array.isArray(meta.segments) ? meta.segments : [],
    bookmarks: Array.isArray(meta.bookmarks) ? meta.bookmarks : [],
    masteredIndices: Array.isArray(meta.masteredIndices) ? meta.masteredIndices : [],
    language: meta.language || 'en',
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
    segments: Array.isArray(note.segments) ? note.segments : [],
    bookmarks: Array.isArray(note.bookmarks) ? note.bookmarks : [],
    masteredIndices: Array.isArray(note.masteredIndices) ? note.masteredIndices : [],
    language: note.language || 'en'
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

  lines.push('', '## Transcript', note.transcript || '');
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
