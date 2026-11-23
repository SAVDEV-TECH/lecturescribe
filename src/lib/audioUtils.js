// Client-side audio chunking, WAV encoding, and timestamped Whisper transcription helper

const MAX_DIRECT_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_SECONDS = 100;

export function formatTimestamp(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function encodeMonoWavSlice(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function mixAudioBufferToMono(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / channels;
    }
  }
  return mono;
}

async function decodeAndSplitAudioToWavChunks(blobOrFile) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Browser cannot split large audio files.');
  }

  const arrayBuffer = await blobOrFile.arrayBuffer();
  const ctx = new AudioCtx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close().catch(() => {});
  }

  // Downsample to 16 kHz mono so each 100s WAV chunk stays ~3.2 MB (under Vercel 4.5 MB limit)
  const targetLength = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  let monoSamples;
  if (typeof OfflineAudioContext !== 'undefined') {
    const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    monoSamples = rendered.getChannelData(0);
  } else {
    const rawMono = mixAudioBufferToMono(decoded);
    const ratio = decoded.sampleRate / TARGET_SAMPLE_RATE;
    const out = new Float32Array(Math.floor(rawMono.length / ratio));
    for (let i = 0; i < out.length; i++) {
      out[i] = rawMono[Math.floor(i * ratio)] || 0;
    }
    monoSamples = out;
  }

  const samplesPerChunk = TARGET_SAMPLE_RATE * CHUNK_DURATION_SECONDS;
  const chunks = [];
  for (let startIdx = 0; startIdx < monoSamples.length; startIdx += samplesPerChunk) {
    const slice = monoSamples.subarray(startIdx, Math.min(monoSamples.length, startIdx + samplesPerChunk));
    chunks.push({
      blob: encodeMonoWavSlice(slice, TARGET_SAMPLE_RATE),
      offsetSeconds: startIdx / TARGET_SAMPLE_RATE,
      fileName: `part_${chunks.length + 1}.wav`
    });
  }

  return chunks;
}

function normalizeSegments(rawSegments = [], offsetSeconds = 0) {
  if (!Array.isArray(rawSegments)) return [];
  return rawSegments
    .map((seg) => {
      const text = String(seg?.text || '').trim();
      if (!text) return null;
      return {
        start: Math.round(((Number(seg?.start) || 0) + offsetSeconds) * 10) / 10,
        end: Math.round(((Number(seg?.end) || 0) + offsetSeconds) * 10) / 10,
        text
      };
    })
    .filter(Boolean);
}

async function postSingleTranscribeChunk(blob, fileName, language) {
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('language', language);

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    let errMsg = `Transcription failed (${res.status}).`;
    try {
      const errData = await res.json();
      if (errData?.error) errMsg = errData.error;
    } catch {}
    const error = new Error(errMsg);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

/**
 * Transcribes an audio blob/file directly when small, or automatically chunks
 * large/long recordings (>3.5 MB or >25 MB) into 100s 16 kHz mono WAV parts.
 */
export async function transcribeAudioWithChunking({
  blobOrFile,
  fileName,
  language = 'en',
  onProgress
}) {
  if (!blobOrFile) {
    throw new Error('No audio available.');
  }

  if (blobOrFile.size <= MAX_DIRECT_UPLOAD_BYTES) {
    onProgress?.('Transcribing...');
    const data = await postSingleTranscribeChunk(blobOrFile, fileName || 'lecture.webm', language);
    return {
      text: String(data?.text || '').trim(),
      segments: normalizeSegments(data?.segments, 0)
    };
  }

  onProgress?.('Preparing long audio...');
  const wavChunks = await decodeAndSplitAudioToWavChunks(blobOrFile);
  const textParts = [];
  const allSegments = [];

  for (let i = 0; i < wavChunks.length; i++) {
    onProgress?.(`Transcribing part ${i + 1}/${wavChunks.length}...`);
    const part = wavChunks[i];
    const data = await postSingleTranscribeChunk(part.blob, part.fileName, language);
    const partText = String(data?.text || '').trim();
    if (partText) {
      textParts.push(partText);
    }
    allSegments.push(...normalizeSegments(data?.segments, part.offsetSeconds));
  }

  return {
    text: textParts.join(' ').trim(),
    segments: allSegments
  };
}
